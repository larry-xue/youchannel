import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { EmptyVideoState } from "~/lib/components/empty-video-state";
import { Loading } from "~/lib/components/ui/loading";
import { VideoCard } from "~/lib/components/video-card";
import * as m from "~/paraglide/messages";
import {
  getYouTubeAccountStatusFn,
  getVideosFn,
  type VideoWithStatus,
} from "~/lib/dashboard/data";
import { z } from "zod";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "~/lib/components/ui/pagination";

const videosSearchSchema = z.object({
  page: z.number().default(1).catch(1),
});

export const Route = createFileRoute("/_layout/library")({
  validateSearch: (search) => videosSearchSchema.parse(search),
  component: DashboardPlaylists,
});

const EMPTY_VIDEOS: VideoWithStatus[] = [];

function DashboardPlaylists() {
  const router = useRouter();
  const navigate = Route.useNavigate();

  const accountQuery = useQuery({
    queryKey: ["youtube-account-status"],
    queryFn: () => getYouTubeAccountStatusFn(),
  });
  const hasAccount = accountQuery.data?.hasAccount ?? false;

  const { page } = Route.useSearch();
  const pageSize = 12;

  const videosQuery = useQuery({
    queryKey: ["videos", page, pageSize],
    queryFn: () => getVideosFn({ data: { page, pageSize } }),
    enabled: hasAccount,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  const videos = videosQuery.data?.videos ?? EMPTY_VIDEOS;
  const total = videosQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const isLoading = videosQuery.isLoading || accountQuery.isLoading;

  const handleOpenVideo = (video: VideoWithStatus) => {
    navigate({
      to: "/learn/$videoId",
      params: { videoId: video.id },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          {m.library_title()}
        </h1>
        <p className="text-sm text-muted-foreground">
          {m.library_description()}
        </p>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <Loading text={m.library_loading()} size="md" />
        ) : videos.length === 0 ? (
          <EmptyVideoState />
        ) : (
          <div className={videosQuery.isPlaceholderData ? "opacity-50 transition-opacity duration-200" : "transition-opacity duration-200"}>
            <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  isSelected={false}
                  hideCheckbox={true}
                  onSelect={() => { }}
                  isSelectable={false}
                  onOpen={handleOpenVideo}
                />
              ))}
            </div>
          </div>
        )
        }

        {totalPages > 1 && (
          <Pagination className="mt-8">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href={
                    page > 1
                      ? router.buildLocation({ to: "/library", search: { page: page - 1 } }).href
                      : undefined
                  }
                  className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  onClick={(e) => {
                    if (page <= 1) e.preventDefault();
                    else {
                      e.preventDefault();
                      navigate({ search: { page: page - 1 } });
                    }
                  }}
                />
              </PaginationItem>

              {/* Simple pagination logic: show current, prev, next, first, last */}
              {totalPages <= 7 ? (
                Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <PaginationItem key={p}>
                    <PaginationLink
                      isActive={page === p}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate({ search: { page: p } });
                      }}
                      className="cursor-pointer"
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ))
              ) : (
                <>
                  {/* First and optionally second page */}
                  <PaginationItem key="page-1">
                    <PaginationLink
                      isActive={page === 1}
                      onClick={(e) => { e.preventDefault(); navigate({ search: { page: 1 } }); }}
                      className="cursor-pointer"
                    >
                      1
                    </PaginationLink>
                  </PaginationItem>

                  {page > 3 && (
                    <PaginationItem key="ellipsis-start">
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}

                  {page > 2 && page < totalPages - 1 && (
                    <PaginationItem key={`page-${page}`}>
                      <PaginationLink
                        isActive={true}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  )}

                  {page < totalPages - 2 && (
                    <PaginationItem key="ellipsis-end">
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}

                  <PaginationItem key={`page-${totalPages}`}>
                    <PaginationLink
                      isActive={page === totalPages}
                      onClick={(e) => { e.preventDefault(); navigate({ search: { page: totalPages } }); }}
                      className="cursor-pointer"
                    >
                      {totalPages}
                    </PaginationLink>
                  </PaginationItem>
                </>
              )}

              <PaginationItem>
                <PaginationNext
                  href={
                    page < totalPages
                      ? router.buildLocation({ to: "/library", search: { page: page + 1 } }).href
                      : undefined
                  }
                  className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  onClick={(e) => {
                    if (page >= totalPages) e.preventDefault();
                    else {
                      e.preventDefault();
                      navigate({ search: { page: page + 1 } });
                    }
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </div>
  );
}
