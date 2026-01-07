/**
 * Dashboard Data API
 *
 * This file re-exports all dashboard API functions from their respective modules.
 * Import from this file to maintain backward compatibility with existing code.
 *
 * Modules:
 * - youtube-account: YouTube OAuth and account status
 * - playlist: Playlist CRUD operations
 * - video: Video listing and retrieval
 * - analysis: Video analysis operations
 * - user: User quota and sync logs
 */

// YouTube Account
export {
  YOUCHANNEL_PLAYLIST_TITLE,
  YOUCHANNEL_PLAYLIST_DESCRIPTION,
  getYouTubeAccountStatusFn,
  startYouTubeOAuthFn,
  completeYouTubeOauthFn,
} from "./youtube-account";

// Playlist
export {
  PLAYLISTS_QUERY_KEY,
  getPlaylistsFn,
  syncPlaylistsFn,
  setActivePlaylistFn,
  restorePlaylistFn,
} from "./playlist";

// YouTube Playlists (API only)
export { getYouTubePlaylistsFn, getYouTubePlaylistItemsFn } from "./youtube-playlists";

// Video
export {
  type VideoWithStatus,
  getVideosFn,
  getVideoByIdFn,
} from "./video";

// Analysis
export {
  type OpenApiAnalysisResponse,
  getVideoAnalysesFn,
  runVideoAnalysisFn,
  triggerOpenApiAnalysisFn,
} from "./analysis";

// User
export {
  type UserQuota,
  USER_QUOTA_QUERY_KEY,
  getUserQuotaFn,
  getSyncLogsFn,
} from "./user";
