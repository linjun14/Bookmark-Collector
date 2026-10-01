"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

type EntryKind = "Link" | "Code" | "Note";
type Entry = {
  id: string;
  title: string;
  url: string;
  kind: EntryKind;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};
type Filter = "All items" | EntryKind;

const storageKey = "little-library.entries.v1";
const filters: Filter[] = ["All items", "Link", "Code", "Note"];

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
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<Filter>("All items");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          if (Array.isArray(parsed)) setEntries(parsed as Entry[]);
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(storageKey, JSON.stringify(entries));
  }, [entries, ready]);

  const tags = Array.from(new Set(entries.flatMap((entry) => entry.tags))).sort(
    (left, right) => left.localeCompare(right),
  );
  const visibleEntries = entries
    .filter((entry) => filter === "All items" || entry.kind === filter)
    .filter((entry) => !activeTag || entry.tags.includes(activeTag))
    .filter((entry) => {
      const searchable = `${entry.title} ${entry.content} ${entry.url} ${entry.tags.join(" ")}`;
      return searchable.toLowerCase().includes(query.trim().toLowerCase());
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  function openEditor(entry: Entry | null = null) {
    setEditingEntry(entry);
    setEditorOpen(true);
  }

  function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const now = new Date().toISOString();
    const kind = formData.get("kind") as EntryKind;
    const selectedTags = formData
      .getAll("existingTags")
      .map((tag) => String(tag).trim().replace(/^#/, ""))
      .filter(Boolean);
    const newTags = String(formData.get("tags"))
      .split(",")
      .map((tag) => tag.trim().replace(/^#/, ""))
      .filter(Boolean);
    const entry: Entry = {
      id: editingEntry?.id ?? crypto.randomUUID(),
      title: String(formData.get("title")).trim(),
      url: String(formData.get("url")).trim(),
      kind,
      content: String(formData.get("content")).trim(),
      tags: Array.from(new Set([...selectedTags, ...newTags])),
      createdAt: editingEntry?.createdAt ?? now,
      updatedAt: now,
    };

    setEntries((current) =>
      editingEntry
        ? current.map((item) => (item.id === entry.id ? entry : item))
        : [entry, ...current],
    );
    setEditorOpen(false);
    setEditingEntry(null);
  }

  function deleteEntry(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
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
                  className={`filter-button ${filter === item && !activeTag ? "is-active" : ""}`}
                  key={item}
                  onClick={() => {
                    setFilter(item);
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
          <span>{ready ? "Saved on this device" : "Loading your library"}</span>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>Library</span><span className="breadcrumb-slash">/</span><strong>{activeTag ? `#${activeTag}` : filter === "All items" ? "Everything" : `${filter}s`}</strong></div>
          <button className="add-button" onClick={() => openEditor()} type="button">
            <span aria-hidden="true">+</span> Add item
          </button>
        </header>

        <div className="content-wrap">
          <div className="page-heading">
            <div>
              <p className="eyebrow">A HOME FOR THE THINGS YOU FIND</p>
              <h1>{activeTag ? `#${activeTag}` : filter === "All items" ? "Your library" : `${filter}s`}</h1>
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
            <span className="result-count">{visibleEntries.length} {visibleEntries.length === 1 ? "item" : "items"}</span>
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
                    <button aria-label={`Edit ${entry.title}`} onClick={() => openEditor(entry)} type="button">Edit</button>
                    <button aria-label={`Delete ${entry.title}`} className="delete-action" onClick={() => deleteEntry(entry.id)} type="button">Delete</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-art" aria-hidden="true"><span>✳</span><i>↗</i></div>
              <p className="empty-kicker">A LITTLE ROOM TO GROW</p>
              <h2>{query || activeTag || filter !== "All items" ? "Nothing here just yet" : "Start your collection"}</h2>
              <p>{query || activeTag || filter !== "All items" ? "Try another search or filter, or save something new." : "Save a link, a useful snippet, or a note you want to find again."}</p>
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
                <button className="add-button save-button" type="submit">{editingEntry ? "Save changes" : "Save item"}<span aria-hidden="true">↗</span></button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
