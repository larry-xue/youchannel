/**
 * Dashboard Data API
 *
 * This file re-exports all dashboard API functions from their respective modules.
 * Import from this file to maintain backward compatibility with existing code.
 *
 * Modules:
 * - youtube-account: YouTube OAuth and account status
 * - video: Video listing and retrieval
 * - analysis: Video analysis operations
 */

// YouTube Account
export {
  Fluentlyby_PLAYLIST_DESCRIPTION,
  Fluentlyby_PLAYLIST_TITLE,
  completeYouTubeOauthFn,
  getYouTubeAccountStatusFn,
  startYouTubeOAuthFn,
} from "./youtube-account";

// YouTube Playlists (API only)
export { getYouTubePlaylistItemsFn, getYouTubePlaylistsFn } from "./youtube-playlists";

// Video
export { getVideoByIdFn, getVideosFn, type VideoWithStatus } from "./video";

// Analysis
export {
  getVideoAnalysesFn,
  triggerOpenApiAnalysisFn,
  type OpenApiAnalysisResponse,
} from "./analysis";
