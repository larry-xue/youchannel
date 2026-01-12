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
  Fluentlyby_PLAYLIST_TITLE,
  Fluentlyby_PLAYLIST_DESCRIPTION,
  getYouTubeAccountStatusFn,
  startYouTubeOAuthFn,
  completeYouTubeOauthFn,
} from "./youtube-account";

// YouTube Playlists (API only)
export { getYouTubePlaylistsFn, getYouTubePlaylistItemsFn } from "./youtube-playlists";

// Video
export {
  getVideosFn,
  getVideoByIdFn,
} from "./video";

// Analysis
export {
  type OpenApiAnalysisResponse,
  getVideoAnalysesFn,
  triggerOpenApiAnalysisFn,
} from "./analysis";
