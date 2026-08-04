"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { FeedPostViewModal } from "@/components/admin/feed-post-view-modal";
import { FeedPostReportModal } from "@/components/admin/feed-post-report-modal";
import { FeedPostReportsModal } from "@/components/admin/feed-post-reports-modal";
import { AdminBadge, StatTile, DataTable, DtTable, DtHead, DtRow, DtCell, DtPagination } from "@/components/admin/ui";
import { confirmAction, toastSuccess, toastError } from "@/lib/alert";
import {
  fetchAdminPosts,
  deleteAdminPost,
  reportAdminPost,
  fetchAdminPostReports,
  postReportStatusLabel,
  type AdminPost,
  type AdminPostReport,
  type AdminPostStats,
} from "@/lib/api/posts";
import { apiError } from "@/lib/api/client";
import { getManagedCommunityId, isSystemAdminUser } from "@/lib/auth/session";
import { PageLoader, PageError } from "@/components/shared/page-states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";

const EMPTY_STATS: AdminPostStats = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  sensitive: 0,
  reported: 0,
};

export default function AdminFeedPage() {
  const searchParams = useSearchParams();
  const highlightPostId = searchParams.get("post");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [stats, setStats] = useState<AdminPostStats>(EMPTY_STATS);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<AdminPost | null>(null);
  const [reporting, setReporting] = useState<AdminPost | null>(null);
  const [reportsPost, setReportsPost] = useState<AdminPost | null>(null);
  const [postReports, setPostReports] = useState<AdminPostReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  const handleDelete = async (post: AdminPost) => {
    if (actionId !== null) return;
    const r = await confirmAction({
      title: "Delete this post?",
      text: `This will permanently remove ${post.author_name}'s post from ${post.community_name ?? "the community"} feed.`,
      confirmText: "Delete post",
      color: "red",
    });
    if (!r.isConfirmed) return;
    setActionId(post.id);
    try {
      await deleteAdminPost(post.id);
      toastSuccess("Post deleted from the feed.");
      if (viewing?.id === post.id) setViewing(null);
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setActionId(null);
    }
  };

  const handleReportSubmit = async (payload: { type: string; reason: string }) => {
    if (!reporting || actionId !== null) return;
    setActionId(reporting.id);
    try {
      const result = await reportAdminPost(reporting.id, payload.reason, payload.type);
      toastSuccess(result.message ?? "Post reported and marked as sensitive.");
      setReporting(null);
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setActionId(null);
    }
  };

  const handleViewReports = async (post: AdminPost) => {
    setReportsPost(post);
    setReportsLoading(true);
    setPostReports([]);
    try {
      const res = await fetchAdminPostReports(post.id);
      setPostReports(res.data);
    } catch (err) {
      toastError(apiError(err));
      setReportsPost(null);
    } finally {
      setReportsLoading(false);
    }
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    setError(null);
    try {
      const scopedCommunityId = isSystemAdminUser() ? "all" : getManagedCommunityId();
      const res = await fetchAdminPosts({
        page,
        per_page: ADMIN_TABLE_PAGE_SIZE,
        ...(scopedCommunityId ? { community_id: scopedCommunityId } : { community_id: "all" }),
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      });
      setPosts(res.data);
      setTotal(res.meta.total);
      setLastPage(res.meta.last_page);
      if (res.meta.stats) setStats(res.meta.stats);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  useEffect(() => {
    if (!highlightPostId || posts.length === 0) return;
    const el = document.getElementById(`feed-post-${highlightPostId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const match = posts.find((post) => String(post.id) === highlightPostId);
    if (match) setViewing(match);
  }, [highlightPostId, posts]);

  const statTiles = useMemo(() => [
    { label: "Live Posts", value: String(stats.approved), hint: "Published in feeds", tone: "blue" as const, icon: <IcoFeed /> },
    { label: "Reported", value: String(stats.reported ?? 0), hint: "Flagged by residents", tone: "red" as const, icon: <IcoFlag /> },
    { label: "Sensitive", value: String(stats.sensitive ?? 0), hint: "Marked by community admin", tone: "amber" as const, icon: <IcoWarn /> },
    { label: "This page", value: String(posts.length), hint: `${total} total matching`, tone: "green" as const, icon: <IcoCheck /> },
  ], [stats.approved, stats.reported, stats.sensitive, posts.length, total]);

  if (loading) return <PageLoader skeleton />;
  if (error) return <PageError message={error} onRetry={() => load()} />;

  return (
    <div className="space-y-6">
      <div>
        <p className="nl-eyebrow">Community</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Feed moderation</h2>
        <p className="mt-1 text-sm text-slate-500">
          Resident reports show as Reported. Admin reports mark posts as Sensitive for mobile users.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statTiles.map((s) => <StatTile key={s.label} {...s} />)}
      </div>

      <DataTable
        title="Community posts"
        totalCount={total}
        visibleCount={posts.length}
        search={searchInput}
        onSearch={setSearchInput}
        searchPlaceholder="Search by author, community, or content…"
        isEmpty={posts.length === 0}
        empty="No posts in the feed yet."
        searching={refreshing}
      >
        <DtTable>
          <DtHead cols={[
            { label: "Post" },
            { label: "Community" },
            { label: "Category" },
            { label: "Submitted" },
            { label: "Status" },
            { label: "", right: true },
          ]} />
          <tbody>
            {posts.map((post) => {
              const busy = actionId === post.id;
              const highlighted = highlightPostId && String(post.id) === highlightPostId;
              return (
                <DtRow
                  key={post.id}
                  id={`feed-post-${post.id}`}
                  className={highlighted ? "bg-teal-50/80 ring-2 ring-teal-200 ring-inset" : undefined}
                >
                  <DtCell first>
                    <p className="font-semibold text-slate-900">{post.author_name}</p>
                    <p className="mt-1 line-clamp-2 text-[12.5px] text-slate-500">{post.body}</p>
                    <p className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400">
                      <span>{post.likes_count} {post.likes_count === 1 ? "like" : "likes"}</span>
                      <span>{post.comments_count} {post.comments_count === 1 ? "comment" : "comments"}</span>
                    </p>
                  </DtCell>
                  <DtCell nowrap muted>{post.community_name ?? "—"}</DtCell>
                  <DtCell nowrap>{post.tag}</DtCell>
                  <DtCell nowrap muted>
                    {new Date(post.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </DtCell>
                  <DtCell>
                    {(() => {
                      const status = postReportStatusLabel(post);
                      if (status === "Sensitive") return <AdminBadge tone="amber">Sensitive</AdminBadge>;
                      if (status === "Reported") return <AdminBadge tone="red">Reported</AdminBadge>;
                      return <AdminBadge tone="green">Published</AdminBadge>;
                    })()}
                  </DtCell>
                  <DtCell last right>
                    <AdminActionsMenu
                      disabled={busy}
                      actions={[
                        {
                          label: "View post",
                          icon: "view",
                          onClick: () => setViewing(post),
                        },
                        {
                          label: "Report post",
                          icon: "ban",
                          tone: "warning",
                          onClick: () => setReporting(post),
                          hidden: post.is_sensitive || post.report_status === "sensitive",
                        },
                        {
                          label: "View reports",
                          icon: "view",
                          onClick: () => handleViewReports(post),
                        },
                        {
                          label: "Delete post",
                          icon: "ban",
                          tone: "danger",
                          onClick: () => handleDelete(post),
                        },
                      ]}
                    />
                  </DtCell>
                </DtRow>
              );
            })}
          </tbody>
        </DtTable>
        <DtPagination
          showing={posts.length}
          total={total}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </DataTable>

      <FeedPostViewModal post={viewing} onClose={() => setViewing(null)} />
      <FeedPostReportModal
        post={reporting}
        busy={actionId === reporting?.id}
        onClose={() => setReporting(null)}
        onSubmit={handleReportSubmit}
      />
      <FeedPostReportsModal
        post={reportsPost}
        reports={postReports}
        loading={reportsLoading}
        onClose={() => {
          setReportsPost(null);
          setPostReports([]);
        }}
      />
    </div>
  );
}

function IcoFeed()  { return <svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h10M4 18h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoCheck() { return <svg viewBox="0 0 20 20" fill="none"><path d="M5 10l4 4 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoFlag()  { return <svg viewBox="0 0 24 24" fill="none"><path d="M5 4v16M5 5h9l-1.2 3.2L14 11.5H5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoWarn()  { return <svg viewBox="0 0 24 24" fill="none"><path d="M12 4.5L21 19H3L12 4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M12 10v4.5M12 17.2h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
