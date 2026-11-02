#!/usr/bin/env bash
# End-to-end test of the apt and dnf repositories (#344), on clean Debian,
# Ubuntu and Fedora containers. It builds tiny stand-in packages, never the
# real app, publishes three releases one after another (a beta, its release,
# and the next beta), and checks at each step what a stable and a beta user
# install and update to. It then checks that both refuse a tampered index.
#
# Usage: test.sh   (needs podman or docker, Node.js 26 and Python 3)
#
# The signing key is made for this run in a temporary GNUPGHOME and deleted
# with it; nothing here touches a real key.
set -euo pipefail

here=$(dirname "$(realpath "$0")")
root=$(realpath "$here/../..")
# The same order as build-site.sh, so CI tests the runtime the deploy uses.
runtime=$(command -v docker || command -v podman)
work=$(mktemp -d)
port=8765
server=''

DEBIAN=docker.io/library/debian:13
APT_CLIENTS=(docker.io/library/debian:13 docker.io/library/ubuntu:24.04 docker.io/library/ubuntu:26.04)
FEDORA=docker.io/library/fedora:44
ARCH=docker.io/library/archlinux:base-devel@sha256:0ccc8b2e55c0c26a6e501e892cc6b1cdea7cfdf77e432941320148b4dabd2bff
clients=()

cleanup() {
  for client in "${clients[@]}"; do
    "$runtime" rm -f "$client" >/dev/null 2>&1 || true
  done
  [[ -n $server ]] && kill "$server" 2>/dev/null || true
  # Containers running as root may leave files the user cannot remove.
  rm -rf "$work" 2>/dev/null || true
}
trap cleanup EXIT

say() { printf '\n== %s\n' "$*"; }

# One container per tool set, so the host needs none of the packaging tools.
tools() {
  "$runtime" run --rm --network host -v "$work:/work:Z" -w /work \
    -e GNUPGHOME=/work/gnupg "$@"
}

say 'Making a signing key for this run'
mkdir -m 700 "$work/gnupg"
# shellcheck disable=SC2016 # Expanded inside the container.
tools "$DEBIAN" bash -c '
  apt-get update -qq && apt-get install -qq -y gpg >/dev/null
  gpg --batch --passphrase "" --quick-gen-key "YapYap test <test@invalid>" ed25519 sign never'

say 'Building stand-in packages'
build_packages() {
  local tag=$1 version=$2 pkgver=$3
  mkdir -p "$work/releases/$tag"
  tools "$DEBIAN" bash -c "
    set -e
    pkg=/tmp/yapyap
    mkdir -p \$pkg/DEBIAN \$pkg/usr/share/yapyap
    echo '$version' > \$pkg/usr/share/yapyap/version
    printf 'Package: yapyap\nVersion: $version\nArchitecture: amd64\nMaintainer: Test <test@invalid>\nDescription: Stand-in for tests\n' > \$pkg/DEBIAN/control
    dpkg-deb --build --root-owner-group \$pkg '/work/releases/$tag/YapYap-$version-linux-amd64.deb' >/dev/null"
  tools "$FEDORA" bash -c "
    set -e
    dnf install -q -y rpm-build >/dev/null
    mkdir -p ~/rpmbuild/SPECS
    cat > ~/rpmbuild/SPECS/yapyap.spec <<SPEC
Name: YapYap
Version: $version
Release: 1
Summary: Stand-in for tests
License: MIT
BuildArch: x86_64
%description
Stand-in for tests.
%install
mkdir -p %{buildroot}/usr/share/yapyap
echo '$version' > %{buildroot}/usr/share/yapyap/version
%files
/usr/share/yapyap/version
SPEC
    rpmbuild -bb --quiet ~/rpmbuild/SPECS/yapyap.spec
    cp ~/rpmbuild/RPMS/x86_64/*.rpm '/work/releases/$tag/YapYap-$version-linux-x86_64.rpm'"
  # makepkg refuses to run as root, so a user of its own builds in /tmp.
  tools "$ARCH" bash -c "
    set -e
    useradd --create-home builder
    install -d -o builder /tmp/build
    cat > /tmp/build/PKGBUILD <<PKGBUILD
pkgname=yapyap-bin
pkgver=$pkgver
pkgrel=1
pkgdesc='Stand-in for tests'
arch=('x86_64')
license=('MIT')
package() {
  install -d \\\$pkgdir/usr/share/yapyap
  echo '$version' > \\\$pkgdir/usr/share/yapyap/version
}
PKGBUILD
    chown builder /tmp/build/PKGBUILD
    cd /tmp/build && runuser -u builder -- makepkg --noconfirm >/dev/null 2>&1
    cp /tmp/build/yapyap-bin-$pkgver-1-x86_64.pkg.tar.zst '/work/releases/$tag/'"
}
build_packages v0.1.0-beta.1 '0.1.0~beta.1' '0.1.0beta.1'
build_packages v0.1.0 '0.1.0' '0.1.0'
build_packages v0.2.0-beta.1 '0.2.0~beta.1' '0.2.0beta.1'

# Publishes the given releases, newest first, as the release workflow would.
published=()
publish() {
  local release=$1
  published=("$release" "${published[@]}")
  say "Publishing $release"
  local json='['
  for tag in "${published[@]}"; do
    local pre=false
    [[ $tag == *-* ]] && pre=true
    local names
    names=$(cd "$work/releases/$tag" && printf '{"name":"%s"},' *)
    json+="{\"tag_name\":\"$tag\",\"prerelease\":$pre,\"draft\":false,\"assets\":[${names%,}]},"
  done
  json="${json%,}]"
  rm -rf "$work/site"
  mkdir -p "$work/site"
  node "$root/scripts/src/bin/package-repository.ts" "$work/site" <<<"$json"
  while read -r tag file; do
    mkdir -p "$work/site/pool/$tag"
    cp "$work/releases/$tag/$file" "$work/site/pool/$tag/"
  done <"$work/site/.plan/files"
  bash "$here/build-site.sh" "$work/site" "$work/gnupg"
}

say 'Serving the site'
publish v0.1.0-beta.1
(cd "$work/site" && exec python3 -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1) &
server=$!
url="http://127.0.0.1:$port"

start_client() {
  local name=$1 image=$2
  "$runtime" run -d --name "$name" --network host "$image" sleep infinity >/dev/null
  clients+=("$name")
}

in_client() {
  local name=$1
  shift
  "$runtime" exec -i "$name" bash -c "$*"
}

# Installs the site's own source file, with the test server's address.
add_apt() {
  local name=$1 channel=$2 suffix=''
  [[ $channel == beta ]] && suffix='-beta'
  in_client "$name" "apt-get update -qq && apt-get install -qq -y ca-certificates >/dev/null
    install -d -m 0755 /etc/apt/keyrings
    cat > /etc/apt/keyrings/yapyap.gpg" <"$work/site/yapyap.gpg"
  sed "s#https://packages.guita.org#$url#" "$work/site/yapyap$suffix.sources" |
    in_client "$name" "cat > /etc/apt/sources.list.d/yapyap.sources"
}

add_dnf() {
  local name=$1 channel=$2 suffix=''
  [[ $channel == beta ]] && suffix='-beta'
  sed "s#https://packages.guita.org#$url#" "$work/site/yapyap$suffix.repo" |
    in_client "$name" "cat > /etc/yum.repos.d/yapyap.repo"
}

# Trusts the site's key the way the install guide says, then adds the section.
add_pacman() {
  local name=$1 channel=$2 suffix=''
  [[ $channel == beta ]] && suffix='-beta'
  in_client "$name" 'cat > /tmp/yapyap.asc' <"$work/site/yapyap.asc"
  # shellcheck disable=SC2016 # Expanded inside the container.
  in_client "$name" 'pacman-key --init >/dev/null 2>&1
    pacman-key --add /tmp/yapyap.asc >/dev/null 2>&1
    pacman-key --lsign-key "$(gpg --with-colons --show-keys /tmp/yapyap.asc | awk -F: "/^fpr/ { print \$10; exit }")" >/dev/null 2>&1'
  sed "s#https://packages.guita.org#$url#" "$work/site/yapyap$suffix.pacman.conf" |
    in_client "$name" "cat >> /etc/pacman.conf"
}

installed() {
  local name=$1
  in_client "$name" 'cat /usr/share/yapyap/version 2>/dev/null || echo none'
}

expect_version() {
  local name=$1 wanted=$2 got
  got=$(installed "$name")
  if [[ $got != "$wanted" ]]; then
    echo "FAIL: $name has $got, expected $wanted" >&2
    exit 1
  fi
  echo "ok: $name has $wanted"
}

# A channel without the package fails to install, which the version check
# then reports; any other problem shows in the output above it.
apt_update() {
  local name=$1
  in_client "$name" 'apt-get update -qq -o Acquire::Retries=0 && apt-get install -qq -y yapyap >/dev/null' || true
}
pacman_update() {
  local name=$1
  in_client "$name" 'pacman -Sy --noconfirm yapyap-bin >/dev/null' || true
}
dnf_update() {
  local name=$1
  in_client "$name" 'dnf -q -y --refresh install YapYap >/dev/null && dnf -q -y --refresh upgrade YapYap >/dev/null' || true
}
update_all() {
  for client in "${clients[@]}"; do
    case $client in
      yapyap-apt-*) apt_update "$client" ;;
      yapyap-dnf-*) dnf_update "$client" ;;
      yapyap-pacman-*) pacman_update "$client" ;;
      *) ;;
    esac
  done
}

n=0
for image in "${APT_CLIENTS[@]}"; do
  n=$((n + 1))
  for channel in stable beta; do
    start_client "yapyap-apt-$n-$channel" "$image"
    add_apt "yapyap-apt-$n-$channel" "$channel"
  done
done
for channel in stable beta; do
  start_client "yapyap-dnf-$channel" "$FEDORA"
  add_dnf "yapyap-dnf-$channel" "$channel"
done
for channel in stable beta; do
  start_client "yapyap-pacman-$channel" "$ARCH"
  add_pacman "yapyap-pacman-$channel" "$channel"
done
# dnf asks to trust the repository's key the first time; -y accepts it.
for channel in stable beta; do
  in_client "yapyap-dnf-$channel" 'dnf -q -y makecache >/dev/null 2>&1' || true
done

check_all() {
  local stable=$1 beta=$2
  for client in "${clients[@]}"; do
    case $client in
      *-stable) expect_version "$client" "$stable" ;;
      *-beta) expect_version "$client" "$beta" ;;
      *) ;;
    esac
  done
}

say 'Only a beta exists: stable users find nothing, beta users get the beta'
update_all
check_all none '0.1.0~beta.1'

publish v0.1.0
say 'The release is out: both channels move to it'
update_all
check_all 0.1.0 0.1.0

publish v0.2.0-beta.1
say 'The next beta: beta users get it, stable users stay'
update_all
check_all 0.1.0 '0.2.0~beta.1'

say 'A tampered index is refused'
# apt trusts a Packages file through the signed InRelease, so that is what a
# forger would have to change.
sed -i 's/^Suite: stable$/Suite: stab1e/' "$work/site/dists/stable/InRelease"
answer=$(in_client yapyap-apt-1-stable 'apt-get update -o Acquire::Retries=0 2>&1' || true)
if grep -q 'signature verification failed\|BADSIG\|signatures were invalid' <<<"$answer"; then
  echo 'ok: apt refuses an InRelease file its signature does not match'
else
  printf '%s\n' "$answer" >&2
  echo 'FAIL: apt accepted a tampered InRelease file' >&2
  exit 1
fi
printf '<!-- tampered -->\n' >>"$work/site/rpm/stable/repodata/repomd.xml"
if in_client yapyap-dnf-stable 'dnf -q -y --refresh makecache' >/dev/null 2>&1; then
  echo 'FAIL: dnf accepted a tampered repomd.xml' >&2
  exit 1
fi
echo 'ok: dnf refuses repository metadata its signature does not match'
printf 'tampered' >>"$work/site/arch/stable/x86_64/yapyap.db"
answer=$(in_client yapyap-pacman-stable 'pacman -Sy --noconfirm 2>&1' || true)
if grep -qi 'signature\|corrupted' <<<"$answer"; then
  echo 'ok: pacman refuses a database its signature does not match'
else
  printf '%s\n' "$answer" >&2
  echo 'FAIL: pacman accepted a tampered database' >&2
  exit 1
fi

say 'All repository checks passed'
