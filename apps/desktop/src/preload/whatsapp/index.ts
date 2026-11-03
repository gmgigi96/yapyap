import { contextBridge, ipcRenderer } from 'electron';
import { ADAPTER_WORLD_ID } from '../../adapter/world.ts';
import { ASSISTANT_BAR_BRIDGE } from '../../shared/api/assistant-bar-api.ts';
import { CHAT_LIST_BRIDGE } from '../../shared/api/chat-list-api.ts';
import { NOTIFICATION_BRIDGE } from '../../shared/api/notification-api.ts';
import { SHARE_BRIDGE } from '../../shared/api/share-api.ts';
import {
  createAssistantBarBridge,
  createChatListBridge,
  createNotificationBridge,
  createShareBridge,
} from './bridge.ts';
import { installNotificationShim } from './notification-shim.ts';
import { installShareShim } from './share-shim.ts';

contextBridge.exposeInMainWorld(NOTIFICATION_BRIDGE, createNotificationBridge(ipcRenderer));
contextBridge.exposeInMainWorld(SHARE_BRIDGE, createShareBridge(ipcRenderer));
// Only YapYap's adapter code runs in this world, so WhatsApp never sees the bar's actions (ADR 0013).
contextBridge.exposeInIsolatedWorld(
  ADAPTER_WORLD_ID,
  ASSISTANT_BAR_BRIDGE,
  createAssistantBarBridge(ipcRenderer),
);
contextBridge.exposeInIsolatedWorld(
  ADAPTER_WORLD_ID,
  CHAT_LIST_BRIDGE,
  createChatListBridge(ipcRenderer),
);
// Before any page script runs, so WhatsApp only ever sees the stand-ins.
contextBridge.executeInMainWorld({ func: installNotificationShim, args: [NOTIFICATION_BRIDGE] });
contextBridge.executeInMainWorld({ func: installShareShim, args: [SHARE_BRIDGE] });
