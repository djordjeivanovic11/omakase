import type { BrowserCapturePayload } from '@omakase/contracts';
import type { PageExtractInput } from './capture';

export type Destination = 'inbox' | 'studio';

export interface StudioOption {
  id: string;
  name: string;
}

export interface PopupStatus {
  desktopConnected: boolean;
  queueLength: number;
  studios: StudioOption[];
}

export interface CaptureRequest {
  includeSelection: boolean;
  userNote: string;
  destination: Destination;
  studioId?: string;
}

export interface CaptureResponse {
  ok: boolean;
  queued?: boolean;
  error?: string;
  title?: string;
  queueLength?: number;
}

export interface ContentExtractMessage {
  type: 'omakase_extract';
  input: PageExtractInput;
}

export interface ContentExtractResponse {
  ok: boolean;
  payload?: BrowserCapturePayload;
  pageTitle?: string;
  error?: string;
}

export type BackgroundMessage =
  | { type: 'get_status' }
  | { type: 'capture'; request: CaptureRequest }
  | { type: 'flush_queue' };

export type BackgroundResponse =
  | PopupStatus
  | CaptureResponse
  | { ok: boolean; sent?: number; remaining?: number; error?: string };
