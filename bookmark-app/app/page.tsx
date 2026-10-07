"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type EntryKind = "Link" | "Code" | "Note";
type EntryRow = Database["public"]["Tables"]["bookmark"]["Row"];
type Entry = {
  id: number;
  title: string;
  url: string;
  kind: EntryKind;
  content: string;
  tags: string[];
  folderId?: string;
  folderName?: string;
  createdAt: string;
  updatedAt: string;
};
type Folder = { id: string; name: string };
type Filter = "All items" | EntryKind;
type SortOrder = "title-asc" | "title-desc" | "created-desc";

const filters: Filter[] = ["All items", "Link", "Code", "Note"];

function entryFromRow(row: EntryRow, folders: Folder[]): Entry {
  if (row.type !== "Link" && row.type !== "Code" && row.type !== "Note") {
    throw new Error(`Bookmark ${row.id} has an unsupported type: ${row.type}`);
  }
  if (!Array.isArray(row.tags) || !row.tags.every((tag): tag is string => typeof tag === "string")) {
    throw new Error(`Bookmark ${row.id} has invalid tags; expected a JSON array of strings.`);
  }

  const folder = row.folder ? folders.find((item) => item.name === row.folder) : undefined;
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    kind: row.type,
    content: row.note ?? "",
    tags: row.tags,
    folderId: folder?.id,
    folderName: row.folder ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function emailForUsername(username: string) {
  return `${username.toLowerCase()}@accounts.littlelibrary.test`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Personal note";
  }
}

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const configMissing = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [dataError, setDataError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>("All items");
  const [sortOrder, setSortOrder] = useState<SortOrder>("created-desc");
  const [activeFolderId, setActiveFolderId] = useState<string | "unfiled" | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [folderEditorOpen, setFolderEditorOpen] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [copiedEntryId, setCopiedEntryId] = useState<number | null>(null);

  useEffect(() => {
    if (configMissing) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;

    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (!session) {
        setEntries([]);
        setFolders([]);
        setLoadedUserId(null);
      }
      setAuthError("");
      setAuthNotice("");
      setAuthLoading(false);
    });

    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setAuthError(errorMessage(error));
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [configMissing]);

  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let active = true;
    void Promise.all([
      supabase.from("bookmark").select("*").order("created_at", { ascending: false }),
      supabase.from("folders").select("*").order("name", { ascending: true }),
    ]).then(([entryResult, folderResult]) => {
      if (!active) return;
      if (entryResult.error) throw entryResult.error;
      if (folderResult.error) throw folderResult.error;
      const loadedFolders = folderResult.data.map((folder) => ({ id: folder.id, name: folder.name }));
      setEntries(entryResult.data.map((entry) => entryFromRow(entry, loadedFolders)));
      setFolders(loadedFolders);
      setDataError("");
      setLoadedUserId(user.id);
    }).catch((error: unknown) => {
      if (!active) return;
      setEntries([]);
      setFolders([]);
      setDataError(`Could not load your library: ${errorMessage(error)}`);
      setLoadedUserId(user.id);
    });

    return () => {
      active = false;
    };
  }, [user]);

  const tags = Array.from(new Set(entries.flatMap((entry) => entry.tags))).sort(
    (left, right) => left.localeCompare(right),
  );
  const activeFolder = folders.find((folder) => folder.id === activeFolderId);
  const visibleEntries = entries
    .filter((entry) => filter === "All items" || entry.kind === filter)
    .filter((entry) => activeFolderId === null || (activeFolderId === "unfiled" ? !entry.folderName : entry.folderId === activeFolderId))
    .filter((entry) => !activeTag || entry.tags.includes(activeTag))
    .filter((entry) => {
      const searchable = `${entry.title} ${entry.content} ${entry.url} ${entry.tags.join(" ")}`;
      return searchable.toLowerCase().includes(query.trim().toLowerCase());
    })
    .sort((left, right) => {
      if (sortOrder === "title-asc") {
        return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
      }
      if (sortOrder === "title-desc") {
        return right.title.localeCompare(left.title, undefined, { sensitivity: "base" });
      }
      return right.createdAt.localeCompare(left.createdAt);
    });

  function openEditor(entry: Entry | null = null) {
    setEditingEntry(entry);
    setEditorOpen(true);
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) return;

    const formData = new FormData(event.currentTarget);
    const kind = formData.get("kind") as EntryKind;
    const selectedTags = formData
      .getAll("existingTags")
      .map((tag) => String(tag).trim().replace(/^#/, ""))
      .filter(Boolean);
    const newTags = String(formData.get("tags"))
      .split(",")
      .map((tag) => tag.trim().replace(/^#/, ""))
      .filter(Boolean);
    const selectedFolderId = String(formData.get("folderId"));
    const entry = {
      title: String(formData.get("title")).trim(),
      url: String(formData.get("url")).trim(),
      type: kind,
      note: String(formData.get("content")).trim(),
      folder: selectedFolderId === "unfiled"
        ? null
        : folders.find((folder) => folder.id === selectedFolderId)?.name ?? null,
      tags: Array.from(new Set([...selectedTags, ...newTags])),
    };

    setSaving(true);
    setDataError("");
    try {
      const result = editingEntry
        ? await supabase
          .from("bookmark")
          .update(entry)
          .eq("id", editingEntry.id)
          .select("*")
          .single()
        : await supabase
          .from("bookmark")
          .insert(entry)
          .select("*")
          .single();
      if (result.error) throw result.error;

      const savedEntry = entryFromRow(result.data, folders);
      setEntries((current) => editingEntry
        ? current.map((item) => (item.id === savedEntry.id ? savedEntry : item))
        : [savedEntry, ...current]);
      setEditorOpen(false);
      setEditingEntry(null);
    } catch (error) {
      setDataError(`Could not save the item: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) return;

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("folderName")).trim();
    if (folders.some((folder) => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setFolderError("A folder with that name already exists.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("folders")
        .insert({ user_id: user.id, name })
        .select("id, name")
        .single();
      if (error) throw error;

      const folder = { id: data.id, name: data.name };
      setFolders((current) => [...current, folder]);
      setActiveFolderId(folder.id);
      setFilter("All items");
      setActiveTag(null);
      setFolderError("");
      setFolderEditorOpen(false);
    } catch (error) {
      setFolderError(`Could not create the folder: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function moveEntry(id: number, folderId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) return;
    const nextFolder = folderId === "unfiled"
      ? null
      : folders.find((folder) => folder.id === folderId) ?? null;
    setDataError("");
    try {
      const { error } = await supabase
        .from("bookmark")
        .update({ folder: nextFolder?.name ?? null })
        .eq("id", id);
      if (error) throw error;
      setEntries((current) => current.map((entry) =>
        entry.id === id
          ? { ...entry, folderId: nextFolder?.id, folderName: nextFolder?.name }
          : entry,
      ));
    } catch (error) {
      setDataError(`Could not move the item: ${errorMessage(error)}`);
    }
  }

  async function deleteEntry(id: number) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) return;
    setDataError("");
    try {
      const { error } = await supabase
        .from("bookmark")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setEntries((current) => current.filter((entry) => entry.id !== id));
    } catch (error) {
      setDataError(`Could not delete the item: ${errorMessage(error)}`);
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username")).trim().toLowerCase();
    const password = String(formData.get("password"));
    if (authMode === "sign-up" && !/^[a-z0-9_]{3,24}$/.test(username)) {
      setAuthError("Choose a username with 3–24 letters, numbers, or underscores.");
      return;
    }

    const email = authMode === "sign-in" && username.includes("@")
      ? username
      : emailForUsername(username);
    setAuthSubmitting(true);
    setAuthError("");
    setAuthNotice("");

    try {
      if (authMode === "sign-up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        if (error) throw error;
        if (!data.session) {
          setAuthNotice("Supabase email confirmation is enabled. Username accounts do not have an email inbox; disable email confirmation in Supabase Authentication settings, then create your account again.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setDataError(`Could not sign out: ${errorMessage(error)}`);
    }
  }

  async function copyEntryValue(entry: Entry) {
    const value = entry.kind === "Code" ? entry.content : entry.url;
    if (!value) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedEntryId(entry.id);
      window.setTimeout(() => setCopiedEntryId((current) => (current === entry.id ? null : current)), 1600);
    } catch {
      // Ignored intentionally: clipboard access is unavailable in some browsers.
    }
  }

  if (configMissing) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <Link className="brand auth-brand" href="/" aria-label="Little Library home">
            <span className="brand-mark" aria-hidden="true">ll</span>
            <span>little library<span className="brand-period">.</span></span>
          </Link>
          <p className="eyebrow">ONE LAST CONNECTION</p>
          <h1>Connect your Supabase project</h1>
          <p className="auth-description">Add your project URL and public anon key to <code>bookmark-app/.env.local</code>, then restart the app.</p>
          <pre className="env-example">{`NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key`}</pre>
          <p className="auth-footnote">Never put a service-role key in a <code>NEXT_PUBLIC_</code> variable.</p>
        </section>
      </main>
    );
  }

  if (authLoading || (user && loadedUserId !== user.id)) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-live="polite">
          <Link className="brand auth-brand" href="/" aria-label="Little Library home">
            <span className="brand-mark" aria-hidden="true">ll</span>
            <span>little library<span className="brand-period">.</span></span>
          </Link>
          <p className="page-subtitle">Loading your private library...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <Link className="brand auth-brand" href="/" aria-label="Little Library home">
            <span className="brand-mark" aria-hidden="true">ll</span>
            <span>little library<span className="brand-period">.</span></span>
          </Link>
          <p className="eyebrow">YOUR SPACE, YOUR PACE</p>
          <h1>{authMode === "sign-in" ? "Welcome back" : "Create your account"}</h1>
          <p className="auth-description">Sign in with your username to access your library across devices.</p>
          <form className="auth-form" onSubmit={submitAuth}>
            <label className="field-label" htmlFor="auth-username">Username</label>
            <input autoComplete="username" id="auth-username" maxLength={64} name="username" required type="text" />
            <label className="field-label" htmlFor="auth-password">Password</label>
            <input autoComplete={authMode === "sign-in" ? "current-password" : "new-password"} id="auth-password" minLength={8} name="password" required type="password" />
            {authMode === "sign-up" && <p className="auth-hint">Use 3–24 letters, numbers, or underscores. Usernames are case-insensitive.</p>}
            {authError && <p className="auth-message is-error" role="alert">{authError}</p>}
            {authNotice && <p className="auth-message" role="status">{authNotice}</p>}
            <button className="add-button auth-submit" disabled={authSubmitting} type="submit">
              {authSubmitting ? "Please wait..." : authMode === "sign-in" ? "Sign in" : "Create account"}
            </button>
          </form>
          <p className="auth-switch">
            {authMode === "sign-in" ? "New to Little Library?" : "Already have an account?"}{" "}
            <button type="button" onClick={() => {
              setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in");
              setAuthError("");
              setAuthNotice("");
            }}>
              {authMode === "sign-in" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Little Library home">
          <span className="brand-mark" aria-hidden="true">ll</span>
          <span>little library<span className="brand-period">.</span></span>
        </Link>

        <div className="sidebar-section">
          <p className="section-label">YOUR LIBRARY</p>
          <nav className="filter-list" aria-label="Filter by type">
            {filters.map((item) => {
              const count = item === "All items"
                ? entries.length
                : entries.filter((entry) => entry.kind === item).length;
              return (
                <button
                  className={`filter-button ${filter === item && !activeTag && activeFolderId === null ? "is-active" : ""}`}
                  key={item}
                  onClick={() => {
                    setFilter(item);
                    setActiveFolderId(null);
                    setActiveTag(null);
                  }}
                  type="button"
                >
                  <span className="filter-symbol" aria-hidden="true">
                    {item === "All items" ? "◫" : item === "Link" ? "↗" : item === "Code" ? "{}" : "≡"}
                  </span>
                  <span>{item === "Link" ? "Links" : item === "Code" ? "Code" : item === "Note" ? "Notes" : item}</span>
                  <span className="filter-count">{count}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-section folder-section">
          <div className="section-heading">
            <p className="section-label">FOLDERS</p>
            <button aria-label="Create folder" className="folder-add-button" onClick={() => { setFolderError(""); setFolderEditorOpen(true); }} title="Create folder" type="button">+</button>
          </div>
          <nav aria-label="Filter by folder" className="folder-list">
            <button
              className={`folder-button ${activeFolderId === "unfiled" ? "is-active" : ""}`}
              onClick={() => { setActiveFolderId("unfiled"); setFilter("All items"); setActiveTag(null); }}
              type="button"
            >
              <span aria-hidden="true">▱</span><span>Unfiled</span>
              <span className="filter-count">{entries.filter((entry) => !entry.folderName).length}</span>
            </button>
            {folders.map((folder) => (
              <button
                className={`folder-button ${activeFolderId === folder.id ? "is-active" : ""}`}
                key={folder.id}
                onClick={() => { setActiveFolderId(folder.id); setFilter("All items"); setActiveTag(null); }}
                type="button"
              >
                <span aria-hidden="true">▱</span><span>{folder.name}</span>
                <span className="filter-count">{entries.filter((entry) => entry.folderId === folder.id).length}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className={`sidebar-section tag-section ${tags.length > 0 ? "has-tags" : ""}`}>
          <div className="section-heading">
            <p className="section-label">TAGS</p>
            {tags.length > 0 && <span className="tag-total">{tags.length}</span>}
          </div>
          {tags.length > 0 ? (
            <div className="tag-list">
              {tags.map((tag) => (
                <button
                  className={`tag-filter ${activeTag === tag ? "is-active" : ""}`}
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  type="button"
                >
                  <span aria-hidden="true">#</span> {tag}
                </button>
              ))}
            </div>
          ) : (
            <p className="tag-empty">Your tags will show up here.</p>
          )}
        </div>

        <div className="sidebar-footer">
          <span className="sync-dot" />
          <span>Saved to your private library</span>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>Library</span><span className="breadcrumb-slash">/</span><strong>{activeTag ? `#${activeTag}` : activeFolderId === "unfiled" ? "Unfiled" : activeFolder?.name ?? (filter === "All items" ? "Everything" : `${filter}s`)}</strong></div>
          <div className="topbar-actions">
            <span className="account-email">{user.user_metadata.username ?? user.email}</span>
            <button className="sign-out-button" onClick={signOut} type="button">Sign out</button>
            <button className="add-button" onClick={() => openEditor()} type="button">
              <span aria-hidden="true">+</span> Add item
            </button>
          </div>
        </header>

        <div className="content-wrap">
          {dataError && <p className="data-error" role="alert">{dataError}</p>}
          <div className="page-heading">
            <div>
              <p className="eyebrow">A HOME FOR THE THINGS YOU FIND</p>
              <h1>{activeTag ? `#${activeTag}` : activeFolderId === "unfiled" ? "Unfiled" : activeFolder?.name ?? (filter === "All items" ? "Your library" : `${filter}s`)}</h1>
              <p className="page-subtitle">Good things are worth keeping.</p>
            </div>
            <div className="collection-count"><span>{entries.length.toString().padStart(2, "0")}</span> saved</div>
          </div>

          <div className="collection-toolbar">
            <label className="search-box">
              <span className="search-icon" aria-hidden="true" />
              <input
                aria-label="Search your library"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your library..."
                type="search"
                value={query}
              />
              <kbd>/</kbd>
            </label>
            <div className="toolbar-options">
              <label className="sort-control">
                <span>Sort by</span>
                <select
                  aria-label="Sort items"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (value === "title-asc" || value === "title-desc" || value === "created-desc") {
                      setSortOrder(value);
                    }
                  }}
                  value={sortOrder}
                >
                  <option value="title-asc">Alphabetical A-Z</option>
                  <option value="title-desc">Alphabetical Z-A</option>
                  <option value="created-desc">Date added</option>
                </select>
              </label>
              <span className="result-count">{visibleEntries.length} {visibleEntries.length === 1 ? "item" : "items"}</span>
            </div>
          </div>

          {visibleEntries.length > 0 ? (
            <div className="entry-list">
              {visibleEntries.map((entry, index) => (
                <article className="entry-card" key={entry.id} style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
                  <div className={`kind-mark kind-${entry.kind.toLowerCase()}`} aria-hidden="true">
                    {entry.kind === "Link" ? "↗" : entry.kind === "Code" ? "{}" : "≡"}
                  </div>
                  <div className="entry-body">
                    <div className="entry-meta">
                      <span className={`kind-label label-${entry.kind.toLowerCase()}`}>{entry.kind}</span>
                      {entry.folderName && <span className="entry-folder-label">{entry.folderName}</span>}
                      {entry.url && <span className="entry-domain">{getDomain(entry.url)}</span>}
                      <span className="meta-dot">·</span>
                      <time dateTime={entry.updatedAt}>{formatDate(entry.updatedAt)}</time>
                    </div>
                    <h2 className="entry-title">
                      {entry.url ? <a href={entry.url} rel="noreferrer" target="_blank">{entry.title}</a> : entry.title}
                    </h2>
                    {entry.content && (
                      <p className={`entry-content ${entry.kind === "Code" ? "code-preview" : ""}`}>
                        {entry.content}
                      </p>
                    )}
                    {entry.tags.length > 0 && (
                      <div className="entry-tags">
                        {entry.tags.map((tag) => (
                          <button key={tag} onClick={() => setActiveTag(tag)} type="button">#{tag}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="entry-actions">
                    {(entry.kind === "Code" || entry.url) && (
                      <button
                        aria-label={entry.kind === "Code" ? `Copy code for ${entry.title}` : `Copy link for ${entry.title}`}
                        className={`copy-action ${copiedEntryId === entry.id ? "is-copied" : ""}`}
                        onClick={() => copyEntryValue(entry)}
                        type="button"
                      >
                        {copiedEntryId === entry.id ? "Copied" : entry.kind === "Code" ? "Copy code" : "Copy link"}
                      </button>
                    )}
                    <select aria-label={`Move ${entry.title} to folder`} className="move-select" onChange={(event) => moveEntry(entry.id, event.target.value)} value={entry.folderId ?? "unfiled"}>
                      <option value="unfiled">Unfiled</option>
                      {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                    </select>
                    <button aria-label={`Edit ${entry.title}`} onClick={() => openEditor(entry)} type="button">Edit</button>
                    <button aria-label={`Delete ${entry.title}`} className="delete-action" onClick={() => { void deleteEntry(entry.id); }} type="button">Delete</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-art" aria-hidden="true"><span>✳</span><i>↗</i></div>
              <p className="empty-kicker">A LITTLE ROOM TO GROW</p>
              <h2>{query || activeTag || activeFolderId !== null || filter !== "All items" ? "Nothing here just yet" : "Start your collection"}</h2>
              <p>{query || activeTag || activeFolderId !== null || filter !== "All items" ? "Try another search or filter, or save something new." : "Save a link, a useful snippet, or a note you want to find again."}</p>
              <button className="add-button empty-add" onClick={() => openEditor()} type="button"><span aria-hidden="true">+</span> Add your first item</button>
            </div>
          )}
          <footer className="page-footer"><span>Made for the things you don’t want to lose.</span><span>YOUR SPACE, YOUR PACE</span></footer>
        </div>
      </section>

      {editorOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorOpen(false); }}>
          <section aria-labelledby="editor-title" aria-modal="true" className="editor-modal" onKeyDown={(event) => { if (event.key === "Escape") setEditorOpen(false); }} role="dialog">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">KEEP IT CLOSE</p>
                <h2 id="editor-title">{editingEntry ? "Edit item" : "Add to your library"}</h2>
              </div>
              <button aria-label="Close editor" className="close-button" onClick={() => setEditorOpen(false)} type="button">×</button>
            </div>
            <form className="entry-form" onSubmit={saveEntry}>
              <label className="field-label" htmlFor="entry-title">Title <span>Required</span></label>
              <input autoFocus defaultValue={editingEntry?.title ?? ""} id="entry-title" maxLength={120} name="title" placeholder="Give it a name" required />

              <div className="field-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="entry-kind">Type</label>
                  <select defaultValue={editingEntry?.kind ?? "Link"} id="entry-kind" name="kind">
                    <option>Link</option><option>Code</option><option>Note</option>
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="entry-url">URL <span>Optional</span></label>
                  <input defaultValue={editingEntry?.url ?? ""} id="entry-url" name="url" placeholder="https://..." type="url" />
                </div>
              </div>

              <label className="field-label" htmlFor="entry-folder">Folder</label>
              <select defaultValue={editingEntry?.folderId ?? (activeFolderId && activeFolderId !== "unfiled" ? activeFolderId : "unfiled")} id="entry-folder" name="folderId">
                <option value="unfiled">Unfiled</option>
                {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>

              <label className="field-label" htmlFor="entry-content">Snippet or note <span>Optional</span></label>
              <textarea defaultValue={editingEntry?.content ?? ""} id="entry-content" maxLength={4000} name="content" placeholder="Add the useful bit you want to remember..." rows={5} />

              <span className="field-label">Existing tags <span>Select any that apply</span></span>
              <details className="tag-picker">
                <summary>
                  <span>Choose from existing tags</span>
                  <span className="tag-picker-count">{tags.length}</span>
                  <span aria-hidden="true" className="tag-picker-chevron">⌄</span>
                </summary>
                <div className="tag-picker-menu">
                  {tags.length > 0 ? tags.map((tag) => (
                    <label className="tag-option" key={tag}>
                      <input defaultChecked={editingEntry?.tags.includes(tag) ?? false} name="existingTags" type="checkbox" value={tag} />
                      <span>#{tag}</span>
                    </label>
                  )) : (
                    <p className="tag-picker-empty">No saved tags yet. Add one below.</p>
                  )}
                </div>
              </details>

              <label className="field-label" htmlFor="entry-tags">Add new tags <span>Separate with commas</span></label>
              <input id="entry-tags" name="tags" placeholder="design, reading, inspiration" />

              <div className="form-actions">
                <button className="cancel-button" onClick={() => setEditorOpen(false)} type="button">Cancel</button>
                <button className="add-button save-button" disabled={saving} type="submit">{saving ? "Saving..." : editingEntry ? "Save changes" : "Save item"}<span aria-hidden="true">↗</span></button>
              </div>
            </form>
          </section>
        </div>
      )}

      {folderEditorOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setFolderEditorOpen(false); }}>
          <section aria-labelledby="folder-editor-title" aria-modal="true" className="editor-modal folder-modal" onKeyDown={(event) => { if (event.key === "Escape") setFolderEditorOpen(false); }} role="dialog">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">MAKE ROOM FOR A THEME</p>
                <h2 id="folder-editor-title">New folder</h2>
              </div>
              <button aria-label="Close folder dialog" className="close-button" onClick={() => setFolderEditorOpen(false)} type="button">×</button>
            </div>
            <form className="entry-form" onSubmit={saveFolder}>
              <label className="field-label" htmlFor="folder-name">Folder name <span>Required</span></label>
              <input autoFocus id="folder-name" maxLength={32} name="folderName" onChange={() => setFolderError("")} placeholder="Reading list, recipes..." required />
              {folderError && <p className="folder-error" role="alert">{folderError}</p>}
              <div className="form-actions">
                <button className="cancel-button" onClick={() => setFolderEditorOpen(false)} type="button">Cancel</button>
                <button className="add-button save-button" disabled={saving} type="submit">{saving ? "Saving..." : "Create folder"}<span aria-hidden="true">↗</span></button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
