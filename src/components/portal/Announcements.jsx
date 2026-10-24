import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  CalendarDays,
  ExternalLink,
  Image as ImageIcon,
  Megaphone,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/widgets";
import { deleteUpdate, listUpdates, saveUpdate } from "@/lib/updates.functions";
import { useCampus } from "@/lib/use-campus";

// Category chips are quiet by design: the icon and the word carry the meaning, so colour is
// left free to mean risk. Each chip is a hairline-ruled tint rather than a filled pill.
export const CATEGORY = {
  placement: {
    label: "Placement",
    icon: Briefcase,
    tone: "border border-ochre/45 bg-ochre-pale text-ochre-ink",
  },
  event: {
    label: "Event",
    icon: CalendarDays,
    tone: "border border-info/35 bg-info/8 text-info",
  },
  notice: {
    label: "Notice",
    icon: Megaphone,
    tone: "border border-rule-strong bg-secondary text-neutral",
  },
  poster: {
    label: "Poster",
    icon: ImageIcon,
    tone: "border border-ink/25 bg-ink/6 text-ink",
  },
};

// Polled so an announcement made by staff reaches open student dashboards without a reload.
const updatesQuery = {
  queryKey: ["campus-updates"],
  queryFn: () => listUpdates(),
  staleTime: 0,
  refetchInterval: 30_000,
};
export const useAnnouncements = () => useQuery(updatesQuery);

const fmt = (iso) =>
  new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function UpdateCard({ u, canDelete, onDelete }) {
  const c = CATEGORY[u.category];
  return (
    <article className="overflow-hidden surface transition-shadow hover:shadow-md">
      {u.image_url && (
        <img
          src={u.image_url}
          alt={`${u.title} poster`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="max-h-72 w-full bg-muted object-cover"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      )}
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium ${c.tone}`}
          >
            <c.icon className="size-3" /> {c.label}
          </span>
          {u.event_date && (
            <span className="text-muted-foreground">
              {u.category === "placement" ? "Drive date" : "On"} {fmt(u.event_date)}
            </span>
          )}
          <span className="ml-auto whitespace-nowrap text-muted-foreground">
            Posted {fmt(u.created_at)}
          </span>
        </div>
        <h3 className="mt-2 font-numeric text-base font-semibold">
          {u.company && <span className="text-primary">{u.company} · </span>}
          {u.title}
        </h3>
        {u.body && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{u.body}</p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          {u.link_url ? (
            <a
              href={u.link_url}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              More details <ExternalLink className="size-3.5" />
            </a>
          ) : (
            <span />
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(u.id)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" /> Remove
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/** The list of announcements, optionally narrowed to some categories. */
export function AnnouncementsFeed({ categories, limit, empty, seeAll = false }) {
  const { data, isLoading, isError } = useAnnouncements();
  const { profile, isAdmin, isFaculty } = useCampus();
  const qc = useQueryClient();
  const remove = useServerFn(deleteUpdate);
  const del = useMutation({
    mutationFn: (id) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: updatesQuery.queryKey }),
  });
  let items = (data ?? []).filter((u) => !categories || categories.includes(u.category));
  const total = items.length;
  if (limit) items = items.slice(0, limit);
  if (isLoading) return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
  if (isError) return <p className="text-sm text-destructive">Updates could not be loaded.</p>;
  if (!items.length)
    return (
      <EmptyState
        title="Nothing posted yet"
        hint={empty ?? "New announcements from the university will appear here."}
      />
    );
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((u) => (
          <UpdateCard
            key={u.id}
            u={u}
            canDelete={isAdmin || (isFaculty && u.created_by === profile.id)}
            onDelete={(id) => del.mutate(id)}
          />
        ))}
      </div>
      {del.isError && <p className="mt-2 text-sm text-destructive">{del.error.message}</p>}
      {seeAll && total > items.length && (
        <Button asChild variant="link" className="mt-2 px-0">
          <Link to="/portal/updates">See all {total} announcements</Link>
        </Button>
      )}
    </div>
  );
}

/** The button that opens the post form. */
export function PostAnnouncementButton({ onClick }) {
  return (
    <Button onClick={onClick}>
      <Plus /> Post an announcement
    </Button>
  );
}

/** Form for teachers and administrators to publish a placement, event, notice or poster. It is
 *  laid out across the whole page, below the page title. */
export function PostAnnouncementForm({ defaultCategory = "notice", onClose }) {
  const qc = useQueryClient();
  const save = useServerFn(saveUpdate);
  const post = useMutation({
    mutationFn: (data) => save({ data }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: updatesQuery.queryKey });
      onClose();
    },
  });
  return (
    <form
      className="mb-6 grid w-full gap-4 surface p-5 md:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const v = (k) => String(f.get(k) ?? "");
        post.mutate({
          category: v("category"),
          title: v("title"),
          body: v("body"),
          company: v("company"),
          eventDate: v("eventDate"),
          imageUrl: v("imageUrl"),
          linkUrl: v("linkUrl"),
        });
      }}
    >
      <label className="text-sm">
        Type
        <select name="category" defaultValue={defaultCategory} className="mt-1 w-full text-sm">
          {Object.entries(CATEGORY).map(([k, c]) => (
            <option key={k} value={k}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Title
        <Input name="title" required minLength={3} maxLength={150} className="mt-1" />
      </label>
      <label className="text-sm">
        Company (for placements)
        <Input name="company" maxLength={100} className="mt-1" />
      </label>
      <label className="text-sm">
        Date
        <Input name="eventDate" type="date" className="mt-1" />
      </label>
      <label className="text-sm md:col-span-2 lg:col-span-4">
        Details
        <Textarea name="body" rows={5} maxLength={2000} className="mt-1" />
      </label>
      <label className="text-sm">
        Poster image link (https)
        <Input name="imageUrl" type="url" placeholder="https://…" className="mt-1" />
      </label>
      <label className="text-sm">
        More-info link (https)
        <Input name="linkUrl" type="url" placeholder="https://…" className="mt-1" />
      </label>
      {post.isError && (
        <p role="alert" className="text-sm text-destructive md:col-span-2 lg:col-span-4">
          {post.error.message}
        </p>
      )}
      <div className="flex gap-2 md:col-span-2 lg:col-span-4">
        <Button type="submit" disabled={post.isPending}>
          Publish
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
