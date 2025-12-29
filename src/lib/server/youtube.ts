const OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type OAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

export type YouTubeChannelSummary = {
  channelId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  customUrl: string | null;
  uploadsPlaylistId: string | null;
};

export type YouTubeVideoSummary = {
  videoId: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  duration: string | null;
  raw: Record<string, unknown>;
};

function getOAuthConfig(): OAuthConfig {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    `${process.env.VITE_BASE_URL}/dashboard`;

  if (!clientId) throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID");
  if (!clientSecret) throw new Error("Missing GOOGLE_OAUTH_CLIENT_SECRET");
  if (!redirectUri) throw new Error("Missing GOOGLE_OAUTH_REDIRECT_URI");

  return { clientId, clientSecret, redirectUri };
}

export function buildYouTubeAuthUrl(state: string) {
  const { clientId, redirectUri } = getOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload?.error_description || "Failed to exchange OAuth code",
    );
  }

  return payload as OAuthTokenResponse;
}

export async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getOAuthConfig();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error_description || "Failed to refresh token");
  }

  return payload as OAuthTokenResponse;
}

async function fetchYouTube<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || "YouTube API request failed");
  }

  return JSON.parse(text) as T;
}

function pickThumbnail(thumbnails?: Record<string, { url?: string }>) {
  if (!thumbnails) return null;
  return (
    thumbnails.maxres?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    null
  );
}

export async function fetchChannelSummaries(accessToken: string) {
  const url = new URL(`${YOUTUBE_API_BASE}/channels`);
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("mine", "true");

  const data = await fetchYouTube<{
    items?: Array<{
      id: string;
      snippet?: {
        title?: string;
        description?: string;
        customUrl?: string;
        thumbnails?: Record<string, { url?: string }>;
      };
      contentDetails?: {
        relatedPlaylists?: { uploads?: string };
      };
    }>;
  }>(url.toString(), accessToken);

  return (
    data.items?.map((item) => ({
      channelId: item.id,
      title: item.snippet?.title || "Untitled channel",
      description: item.snippet?.description || null,
      thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
      customUrl: item.snippet?.customUrl || null,
      uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || null,
    })) || []
  );
}

async function fetchPlaylistItems(
  accessToken: string,
  playlistId: string,
  maxResults = 25,
) {
  const collected: Array<{
    videoId: string;
    snippet: Record<string, unknown>;
  }> = [];
  let pageToken: string | undefined = undefined;

  while (collected.length < maxResults) {
    const url = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", "25");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const data = await fetchYouTube<{
      nextPageToken?: string;
      items?: Array<{
        snippet?: Record<string, unknown>;
        contentDetails?: { videoId?: string };
      }>;
    }>(url.toString(), accessToken);

    for (const item of data.items || []) {
      const videoId = item.contentDetails?.videoId;
      if (!videoId) continue;
      collected.push({
        videoId,
        snippet: item.snippet || {},
      });
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return collected.slice(0, maxResults);
}

async function fetchVideoDetails(
  accessToken: string,
  videoIds: string[],
): Promise<Record<string, Record<string, unknown>>> {
  if (videoIds.length === 0) return {};
  const details: Record<string, Record<string, unknown>> = {};
  const chunkSize = 50;

  for (let i = 0; i < videoIds.length; i += chunkSize) {
    const chunk = videoIds.slice(i, i + chunkSize);
    const url = new URL(`${YOUTUBE_API_BASE}/videos`);
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("id", chunk.join(","));

    const data = await fetchYouTube<{
      items?: Array<{
        id: string;
        snippet?: Record<string, unknown>;
        contentDetails?: Record<string, unknown>;
      }>;
    }>(url.toString(), accessToken);

    for (const item of data.items || []) {
      details[item.id] = {
        snippet: item.snippet || {},
        contentDetails: item.contentDetails || {},
      };
    }
  }

  return details;
}

export async function fetchChannelVideos(
  accessToken: string,
  uploadsPlaylistId: string,
  maxResults = 25,
): Promise<YouTubeVideoSummary[]> {
  const playlistItems = await fetchPlaylistItems(
    accessToken,
    uploadsPlaylistId,
    maxResults,
  );
  const videoIds = playlistItems.map((item) => item.videoId);
  const detailsMap = await fetchVideoDetails(accessToken, videoIds);

  return playlistItems.map((item) => {
    const snippet = item.snippet as Record<string, any>;
    const details = detailsMap[item.videoId] || {};
    const snippetDetails = details.snippet as Record<string, any> | undefined;
    const contentDetails = details.contentDetails as Record<string, any> | undefined;

    return {
      videoId: item.videoId,
      title: (snippet?.title as string) || "Untitled video",
      description: (snippet?.description as string) || null,
      publishedAt: (snippet?.publishedAt as string) || null,
      thumbnailUrl: pickThumbnail(snippet?.thumbnails),
      duration: (contentDetails?.duration as string) || null,
      raw: {
        playlistSnippet: snippet,
        videoSnippet: snippetDetails,
        contentDetails,
      },
    };
  });
}
