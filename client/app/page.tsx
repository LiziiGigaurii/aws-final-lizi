"use client";

import {
  ChangeEvent,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";

type ImageMetadata = {
  format?: string;
  size?: number;
  width?: number;
  height?: number;
};

type LibraryImage = {
  id: string;
  url: string;
  transformedUrls?: string[];
  isFavorite?: boolean;
  metadata?: ImageMetadata;
};

type LibraryResponse = {
  data?: LibraryImage[];
  meta?: { total?: number; totalPages?: number };
};

type Album = {
  id: string;
  name: string;
  imageCount: number;
};

type CropSelection = { x: number; y: number; width: number; height: number };
type CropGestureMode =
  | "draw"
  | "move"
  | "resize-nw"
  | "resize-ne"
  | "resize-sw"
  | "resize-se";
type CropGesture = {
  mode: CropGestureMode;
  startX: number;
  startY: number;
  pointX: number;
  pointY: number;
  selection: CropSelection | null;
};

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function cropSelectionForGesture(gesture: CropGesture): CropSelection {
  const { mode, startX, startY, pointX, pointY, selection } = gesture;
  if (mode === "draw") {
    return {
      x: Math.min(startX, pointX),
      y: Math.min(startY, pointY),
      width: Math.abs(pointX - startX),
      height: Math.abs(pointY - startY),
    };
  }

  if (!selection) return { x: 0, y: 0, width: 0, height: 0 };
  if (mode === "move") {
    return {
      ...selection,
      x: Math.min(1 - selection.width, Math.max(0, selection.x + pointX - startX)),
      y: Math.min(1 - selection.height, Math.max(0, selection.y + pointY - startY)),
    };
  }

  let left = selection.x;
  let top = selection.y;
  let right = selection.x + selection.width;
  let bottom = selection.y + selection.height;
  const corner = mode.slice(-2);
  if (corner.includes("w")) left = Math.min(pointX, right - 0.02);
  if (corner.includes("e")) right = Math.max(pointX, left + 0.02);
  if (corner.includes("n")) top = Math.min(pointY, bottom - 0.02);
  if (corner.includes("s")) bottom = Math.max(pointY, top + 0.02);

  return {
    x: clampUnit(left),
    y: clampUnit(top),
    width: Math.max(0.02, right - left),
    height: Math.max(0.02, bottom - top),
  };
}

const API_URL = "";

async function apiRequest<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join(", ")
      : data.message || "Something went wrong. Try again.";
    throw new Error(message);
  }
  return data as T;
}

function formatBytes(bytes?: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"library" | "favorites" | "albums">(
    "library",
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalImages, setTotalImages] = useState(0);
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [openAlbumId, setOpenAlbumId] = useState("");
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(
    new Set(),
  );
  const [albumTargetId, setAlbumTargetId] = useState("");
  const [albumBusy, setAlbumBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [originalPreviewIds, setOriginalPreviewIds] = useState<Set<string>>(
    new Set(),
  );
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [selectedImage, setSelectedImage] = useState<LibraryImage | null>(null);
  const [quality, setQuality] = useState(80);
  const [rotation, setRotation] = useState(0);
  const [cropMode, setCropMode] = useState(false);
  const [cropSelection, setCropSelection] = useState<CropSelection | null>(null);
  const [cropGesture, setCropGesture] = useState<CropGesture | null>(null);
  const [transformBusy, setTransformBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [transformFields, setTransformFields] = useState({
    width: "",
    height: "",
    format: "",
    color: "",
    grayscale: false,
    mirror: false,
    flip: false,
    sepia: false,
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const previewFrame = useRef<HTMLDivElement>(null);
  const cropInteraction = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem("framehouse_token") || "");
    setUsername(localStorage.getItem("framehouse_user") || "");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    if (activeTab === "albums" && !openAlbumId) {
      setImages([]);
      setTotalImages(0);
      setTotalPages(1);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    const load = async () => {
      setLoading(true);
      try {
        const isAlbum = activeTab === "albums";
        const endpoint = isAlbum
          ? `/albums/${openAlbumId}`
          : activeTab === "favorites"
            ? "/images/favorites"
            : "/images";
        const result = await apiRequest<
          LibraryResponse & { images?: LibraryImage[] }
        >(isAlbum ? endpoint : `${endpoint}?page=${page}&limit=8`, token);
        if (cancelled) return;
        const nextImages = isAlbum ? result.images || [] : result.data || [];
        setImages(nextImages);
        setTotalImages(isAlbum ? nextImages.length : result.meta?.total ?? nextImages.length);
        setTotalPages(isAlbum ? 1 : result.meta?.totalPages || 1);
      } catch (error) {
        if (!cancelled)
          showToast(
            error instanceof Error ? error.message : "Unable to load images.",
            true,
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeTab, openAlbumId, page, ready, refreshKey, token]);

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    void apiRequest<{ data?: Album[] }>("/albums", token)
      .then((result) => {
        if (!cancelled) setAlbums(result.data || []);
      })
      .catch((error) => {
        if (!cancelled) {
          showToast(
            error instanceof Error ? error.message : "Unable to load albums.",
            true,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ready, refreshKey, token]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  function showToast(message: string, error = false) {
    setToast({ message, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("username") || "").trim();
    const accountEmail = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    setAuthBusy(true);
    setAuthError("");
    try {
      if (registerMode) {
        await apiRequest("/auth/register", "", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: name,
            email: accountEmail,
            password,
          }),
        });
        setRegisterMode(false);
        showToast("Workspace created. Sign in to continue.");
      } else {
        const result = await apiRequest<{
          access_token: string;
          username: string;
        }>(
          "/auth/login",
          "",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: accountEmail, password }),
          },
        );
        localStorage.setItem("framehouse_token", result.access_token);
        localStorage.setItem("framehouse_user", result.username);
        setUsername(result.username);
        setToken(result.access_token);
      }
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Unable to sign in.",
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setUploadBusy(true);
    try {
      await apiRequest("/images", token, { method: "POST", body: form });
      showToast("Image added to your library.");
      setActiveTab("library");
      setPage(1);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to upload image.",
        true,
      );
    } finally {
      setUploadBusy(false);
      event.target.value = "";
    }
  }

  async function toggleFavorite(image: LibraryImage) {
    try {
      await apiRequest(`/images/${image.id}/favorite`, token, {
        method: "PATCH",
      });
      showToast("Favorites updated.");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to update favorite.",
        true,
      );
    }
  }

  async function deleteImage(image: LibraryImage) {
    if (!window.confirm("Delete this image and all transformed versions?"))
      return;
    try {
      await apiRequest(`/images/${image.id}`, token, { method: "DELETE" });
      setSelectedImageIds((current) => {
        const next = new Set(current);
        next.delete(image.id);
        return next;
      });
      showToast("Image removed from the library.");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to delete image.",
        true,
      );
    }
  }

  function closeTransform() {
    setSelectedImage(null);
    setQuality(80);
    setRotation(0);
    setCropMode(false);
    setCropSelection(null);
    setCropGesture(null);
    setTransformFields({
      width: "",
      height: "",
      format: "",
      color: "",
      grayscale: false,
      mirror: false,
      flip: false,
      sepia: false,
    });
  }

  function getCropPoint(event: ReactPointerEvent<HTMLElement>) {
    const bounds = previewFrame.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: clampUnit((event.clientX - bounds.left) / bounds.width),
      y: clampUnit((event.clientY - bounds.top) / bounds.height),
    };
  }

  function beginCropGesture(
    event: ReactPointerEvent<HTMLElement>,
    requestedMode?: CropGestureMode,
  ) {
    if (!cropMode || !previewFrame.current || !cropInteraction.current) return;
    event.preventDefault();
    cropInteraction.current.setPointerCapture(event.pointerId);
    const point = getCropPoint(event);
    const isInsideSelection =
      cropSelection &&
      point.x >= cropSelection.x &&
      point.x <= cropSelection.x + cropSelection.width &&
      point.y >= cropSelection.y &&
      point.y <= cropSelection.y + cropSelection.height;
    const mode = requestedMode || (isInsideSelection ? "move" : "draw");
    if (mode === "draw") setCropSelection(null);
    setCropGesture({
      mode,
      startX: point.x,
      startY: point.y,
      pointX: point.x,
      pointY: point.y,
      selection: cropSelection,
    });
  }

  function updateCropGesture(event: ReactPointerEvent<HTMLElement>) {
    if (!cropGesture) return;
    event.preventDefault();
    const point = getCropPoint(event);
    setCropGesture((gesture) =>
      gesture ? { ...gesture, pointX: point.x, pointY: point.y } : null,
    );
  }

  function finishCropGesture(event: ReactPointerEvent<HTMLElement>) {
    if (!cropGesture) return;
    event.preventDefault();
    const point = getCropPoint(event);
    const selection = cropSelectionForGesture({
      ...cropGesture,
      pointX: point.x,
      pointY: point.y,
    });
    setCropSelection(
      selection.width >= 0.02 && selection.height >= 0.02 ? selection : null,
    );
    setCropGesture(null);
  }

  async function handleTransform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedImage) return;
    const body: Record<string, unknown> = {
      filters: {
        grayscale: transformFields.grayscale,
        mirror: transformFields.mirror,
        flip: transformFields.flip,
        sepia: transformFields.sepia,
        color: transformFields.color || undefined,
      },
      compress: { quality },
    };
    const width = Number(transformFields.width);
    const height = Number(transformFields.height);
    if (width && height) body.resize = { width, height };
    if (cropPixelRect) body.crop = cropPixelRect;
    if (rotation) body.rotate = rotation;
    if (transformFields.format) body.format = transformFields.format;

    setTransformBusy(true);
    try {
      const result = await apiRequest<{ url?: string }>(
        `/images/${selectedImage.id}/transform`,
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (result.url) {
        setImages((current) =>
          current.map((image) =>
            image.id === selectedImage.id
              ? {
                  ...image,
                  transformedUrls: [
                    ...(image.transformedUrls || []),
                    result.url!,
                  ],
                }
              : image,
          ),
        );
      }
      setOriginalPreviewIds((current) => {
        const next = new Set(current);
        next.delete(selectedImage.id);
        return next;
      });
      closeTransform();
      showToast("New version created.");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to transform image.",
        true,
      );
    } finally {
      setTransformBusy(false);
    }
  }

  function chooseTab(tab: "library" | "favorites") {
    setActiveTab(tab);
    setOpenAlbumId("");
    setSelectedImageIds(new Set());
    setPage(1);
  }

  function chooseAlbums() {
    setActiveTab("albums");
    setOpenAlbumId("");
    setSelectedImageIds(new Set());
    setPage(1);
  }

  async function createAlbum() {
    const name = window.prompt("Album name")?.trim();
    if (!name) return;
    setAlbumBusy(true);
    try {
      const album = await apiRequest<Album>("/albums", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setAlbums((current) => [album, ...current]);
      setAlbumTargetId(album.id);
      setActiveTab("library");
      setOpenAlbumId("");
      setPage(1);
      showToast("Album created. Select photos to add.");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to create album.",
        true,
      );
    } finally {
      setAlbumBusy(false);
    }
  }

  async function addSelectedToAlbum() {
    if (!albumTargetId || selectedImageIds.size === 0) return;
    setAlbumBusy(true);
    try {
      await apiRequest(`/albums/${albumTargetId}/images`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds: [...selectedImageIds] }),
      });
      setSelectedImageIds(new Set());
      showToast("Photos added to album.");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to add photos.",
        true,
      );
    } finally {
      setAlbumBusy(false);
    }
  }

  function openUpload() {
    document
      .getElementById("uploadSection")
      ?.scrollIntoView({ behavior: "smooth" });
    fileInput.current?.click();
  }

  const previewLookFilters: Record<string, string> = {
    warm: "sepia(0.22) saturate(1.15)",
    cool: "hue-rotate(12deg) saturate(0.9)",
    vintage: "sepia(0.3) saturate(0.8) contrast(0.95)",
    vivid: "saturate(1.45)",
    fade: "saturate(0.7) contrast(0.9) brightness(1.04)",
  };
  const previewFilter = [
    transformFields.grayscale ? "grayscale(1)" : "",
    transformFields.sepia ? "sepia(1)" : "",
    previewLookFilters[transformFields.color] || "",
  ]
    .filter(Boolean)
    .join(" ") || "none";
  const hasCustomDimensions =
    Number(transformFields.width) > 0 && Number(transformFields.height) > 0;
  const sourceWidth = selectedImage?.metadata?.width ?? 0;
  const sourceHeight = selectedImage?.metadata?.height ?? 0;
  const cropCoordinateWidth = hasCustomDimensions
    ? Number(transformFields.width)
    : sourceWidth;
  const cropCoordinateHeight = hasCustomDimensions
    ? Number(transformFields.height)
    : sourceHeight;
  const cropX = cropSelection
    ? Math.round(cropSelection.x * cropCoordinateWidth)
    : 0;
  const cropY = cropSelection
    ? Math.round(cropSelection.y * cropCoordinateHeight)
    : 0;
  const cropRight = cropSelection
    ? Math.round(
        (cropSelection.x + cropSelection.width) * cropCoordinateWidth,
      )
    : 0;
  const cropBottom = cropSelection
    ? Math.round(
        (cropSelection.y + cropSelection.height) * cropCoordinateHeight,
      )
    : 0;
  const cropPixelRect =
    cropSelection && cropCoordinateWidth > 0 && cropCoordinateHeight > 0
      ? {
          x: cropX,
          y: cropY,
          width: Math.max(1, Math.min(cropCoordinateWidth, cropRight) - cropX),
          height: Math.max(
            1,
            Math.min(cropCoordinateHeight, cropBottom) - cropY,
          ),
        }
      : null;
  const activeCropSelection = cropGesture
    ? cropSelectionForGesture(cropGesture)
    : cropSelection;
  const previewRadians = (rotation * Math.PI) / 180;
  const previewCosine = Math.abs(Math.cos(previewRadians));
  const previewSine = Math.abs(Math.sin(previewRadians));
  const previewBoxAspect = hasCustomDimensions
    ? Number(transformFields.width) / Number(transformFields.height)
    : sourceWidth && sourceHeight
      ? sourceWidth / sourceHeight
      : 5 / 4;
  const previewScale = Math.min(
    1,
    1 / (previewCosine + previewSine / previewBoxAspect),
    1 / (previewCosine + previewSine * previewBoxAspect),
  );
  const previewWidth = hasCustomDimensions
    ? Number(transformFields.width)
    : selectedImage?.metadata?.width;
  const previewHeight = hasCustomDimensions
    ? Number(transformFields.height)
    : selectedImage?.metadata?.height;

  if (!ready) return null;

  return (
    <>
      {!token ? (
        <section className="auth-shell">
          <div className="auth-art">
            <div className="art-grid" />
            <div className="art-caption">
              <span className="eyebrow">FRAMEHOUSE / 01</span>
              <h1>
                Make room
                <br />
                for better images.
              </h1>
              <p>A quiet workspace for the images you want to keep moving.</p>
            </div>
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
          </div>
          <div className="auth-panel">
            <div className="brand-mark">
              <span>F</span> framehouse
            </div>
            <div className="auth-copy">
              <span className="eyebrow">YOUR PRIVATE STUDIO</span>
              <h2>{registerMode ? "Make it yours." : "Welcome back."}</h2>
              <p>
                {registerMode
                  ? "Create a private image workspace."
                  : "Sign in to your image workspace."}
              </p>
            </div>
            <form className="auth-form" onSubmit={handleAuth}>
              {registerMode && (
                <label className="field">
                  <span>Username</span>
                  <input
                    name="username"
                    required
                    minLength={3}
                    autoComplete="username"
                    placeholder="your name"
                  />
                </label>
              )}
              <label className="field">
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  name="password"
                  required
                  minLength={6}
                  type="password"
                  autoComplete={
                    registerMode ? "new-password" : "current-password"
                  }
                  placeholder="six characters minimum"
                />
              </label>
              <button
                className="button button-dark button-wide"
                type="submit"
                disabled={authBusy}
              >
                {registerMode ? "Create workspace" : "Sign in"} <span>↗</span>
              </button>
            </form>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setRegisterMode((value) => !value);
                setAuthError("");
              }}
            >
              {registerMode ? (
                <>
                  Already have a workspace? <strong>Sign in</strong>
                </>
              ) : (
                <>
                  Need an account? <strong>Create one</strong>
                </>
              )}
            </button>
            <p className="form-error" role="alert">
              {authError}
            </p>
          </div>
        </section>
      ) : (
        <main className={`app-shell${activeTab === "albums" ? " albums-view" : ""}`}>
          <aside className="sidebar">
            <div className="brand-mark">
              <span>F</span> framehouse
            </div>
            <nav className="side-nav" aria-label="Image workspace">
              <button
                className={`nav-item${activeTab === "library" ? " active" : ""}`}
                onClick={() => chooseTab("library")}
              >
                <span className="nav-icon">▦</span> Library
              </button>
              <button
                className={`nav-item${activeTab === "favorites" ? " active" : ""}`}
                onClick={() => chooseTab("favorites")}
              >
                <span className="nav-icon">♡</span> Favorites
              </button>
              <button
                className={`nav-item${activeTab === "albums" ? " active" : ""}`}
                onClick={chooseAlbums}
              >
                <span className="nav-icon">▣</span> Albums
              </button>
              <button className="nav-item" onClick={openUpload}>
                <span className="nav-icon">＋</span> New upload
              </button>
            </nav>
            <div className="sidebar-note">
              <span className="eyebrow">STUDIO NOTE</span>
              <p>Small edits. Clearer stories.</p>
            </div>
            <button
              className="logout-button"
              onClick={() => {
                localStorage.removeItem("framehouse_token");
                localStorage.removeItem("framehouse_user");
                setToken("");
                setImages([]);
              }}
            >
              Log out <span>↗</span>
            </button>
          </aside>
          <section className="workspace">
            <header className="topbar">
              <div>
                <span className="eyebrow">IMAGE LIBRARY</span>
                <h1>
                  Good to see you, <span>{username || "creator"}</span>.
                </h1>
              </div>
              <div className="top-actions">
                <button
                  className="button button-dark"
                  onClick={() => void createAlbum()}
                  disabled={albumBusy}
                >
                  New album <span>＋</span>
                </button>
                <button
                  className="icon-button"
                  title="Refresh library"
                  aria-label="Refresh library"
                  onClick={() => setRefreshKey((value) => value + 1)}
                >
                  ↻
                </button>
                <button
                  className="button button-coral"
                  onClick={openUpload}
                  disabled={uploadBusy}
                >
                  {uploadBusy ? "Uploading…" : "Upload image"} <span>＋</span>
                </button>
              </div>
            </header>
            <section className="stats-row">
              <div className="stat-card">
                <span className="stat-label">Library</span>
                <strong>{totalImages}</strong>
                <span className="stat-detail">images stored</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Latest format</span>
                <strong>
                  {images[0]?.metadata?.format?.toUpperCase() || "—"}
                </strong>
                <span className="stat-detail">from your recent upload</span>
              </div>
              <div className="stat-card stat-accent">
                <span className="stat-label">Workspace</span>
                <strong>Private</strong>
                <span className="stat-detail">owner-only access</span>
              </div>
            </section>
            <section id="uploadSection" className="upload-zone">
              <div className="upload-copy">
                <span className="eyebrow">ADD TO LIBRARY</span>
                <h2>
                  Drop a frame
                  <br />
                  <em>into the room.</em>
                </h2>
                <p>
                  Upload an original image, then shape a new version without
                  touching the source.
                </p>
                <button
                  className="button button-dark"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploadBusy}
                >
                  {uploadBusy ? "Uploading…" : "Choose image"} <span>↗</span>
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleUpload}
                />
              </div>
              <div className="upload-visual">
                <div className="visual-frame">
                  <div className="visual-sun" />
                  <div className="visual-mountain mountain-back" />
                  <div className="visual-mountain mountain-front" />
                  <div className="visual-line" />
                </div>
                <span className="visual-label">ORIGINAL / 01</span>
              </div>
            </section>
            <section className="library-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    {activeTab === "albums" ? "YOUR ALBUMS" : "YOUR COLLECTION"}
                  </span>
                  <h2>
                    {activeTab === "albums"
                      ? openAlbumId
                        ? albums.find((album) => album.id === openAlbumId)?.name || "Album"
                        : "Your albums"
                      : activeTab === "favorites"
                        ? "Favorite frames"
                        : "Recent frames"}{" "}
                    <span>
                      ({activeTab === "albums" && !openAlbumId ? albums.length : totalImages})
                    </span>
                  </h2>
                </div>
                <div className="section-tools">
                  {activeTab === "library" && selectedImageIds.size > 0 && (
                    <div className="selection-tools">
                      <span>{selectedImageIds.size} selected</span>
                      <select
                        aria-label="Choose an album"
                        value={albumTargetId}
                        onChange={(event) => setAlbumTargetId(event.target.value)}
                      >
                        <option value="">Choose album</option>
                        {albums.map((album) => (
                          <option key={album.id} value={album.id}>
                            {album.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className="button button-dark"
                        onClick={() => void addSelectedToAlbum()}
                        disabled={!albumTargetId || albumBusy}
                      >
                        Add to album
                      </button>
                    </div>
                  )}
                  {activeTab !== "albums" && (
                    <div className="pagination">
                      <button
                        className="page-button"
                        title="Previous page"
                        disabled={page <= 1}
                        onClick={() => setPage((value) => Math.max(1, value - 1))}
                      >
                        ←
                      </button>
                      <span>
                        {page} / {totalPages}
                      </span>
                      <button
                        className="page-button"
                        title="Next page"
                        disabled={page >= totalPages}
                        onClick={() =>
                          setPage((value) => Math.min(totalPages, value + 1))
                        }
                      >
                        →
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {activeTab === "albums" && !openAlbumId ? (
                <div className="album-list">
                  {albums.map((album) => (
                    <button
                      className="album-row"
                      key={album.id}
                      onClick={() => setOpenAlbumId(album.id)}
                    >
                      <span className="album-mark">▣</span>
                      <strong>{album.name}</strong>
                      <span className="album-count">{album.imageCount} photos</span>
                      <span className="album-arrow">↗</span>
                    </button>
                  ))}
                  {albums.length === 0 && (
                    <div className="empty-state">
                      <div className="empty-shape">▣</div>
                      <h3>No albums yet.</h3>
                      <p>Create an album, then select photos from your library.</p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {activeTab === "albums" && (
                    <button
                      className="back-to-albums"
                      onClick={() => setOpenAlbumId("")}
                    >
                      ← All albums
                    </button>
                  )}
                  <div className={`gallery${loading ? " is-loading" : ""}`}>
                {images.map((image) => {
                  const transformedUrls = image.transformedUrls || [];
                  const showingOriginal = originalPreviewIds.has(image.id);
                  const previewUrl = showingOriginal
                    ? image.url
                    : transformedUrls.at(-1) || image.url;
                  const versionLabel =
                    showingOriginal || !transformedUrls.length
                      ? "original"
                      : "latest version";
                  return (
                    <article className="image-card" key={image.id}>
                      <div className="image-visual">
                        {activeTab === "library" && (
                          <label className="image-select" title="Select photo">
                            <input
                              type="checkbox"
                              checked={selectedImageIds.has(image.id)}
                              aria-label="Select photo"
                              onChange={(event) =>
                                setSelectedImageIds((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) next.add(image.id);
                                  else next.delete(image.id);
                                  return next;
                                })
                              }
                            />
                          </label>
                        )}
                        <a href={previewUrl} target="_blank" rel="noreferrer">
                          <Image
                            className="image-preview"
                            src={previewUrl}
                            alt="Uploaded frame"
                            width={800}
                            height={640}
                            unoptimized
                          />
                        </a>
                        <button
                          className={`favorite-button${image.isFavorite ? " favorite-active" : ""}`}
                          onClick={() => void toggleFavorite(image)}
                          title="Toggle favorite"
                          aria-label="Toggle favorite"
                        >
                          {image.isFavorite ? "★" : "☆"}
                        </button>
                      </div>
                      <div className="image-meta">
                        <h3>
                          {image.metadata?.format?.toUpperCase() || "IMAGE"}{" "}
                          {versionLabel}
                        </h3>
                        <p>
                          {image.metadata?.width || "—"} ×{" "}
                          {image.metadata?.height || "—"} px ·{" "}
                          {formatBytes(image.metadata?.size)}
                        </p>
                        <div className="card-actions">
                          <button
                            className="card-button"
                            onClick={() => setSelectedImage(image)}
                          >
                            Transform
                          </button>
                          {transformedUrls.length > 0 && (
                            <button
                              className="card-button"
                              onClick={() =>
                                setOriginalPreviewIds((current) => {
                                  const next = new Set(current);
                                  if (showingOriginal) next.delete(image.id);
                                  else next.add(image.id);
                                  return next;
                                })
                              }
                            >
                              {showingOriginal
                                ? "Show latest"
                                : "Revert to original"}
                            </button>
                          )}
                          <button
                            className="card-button delete"
                            onClick={() => void deleteImage(image)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
                  </div>
                  {images.length === 0 && !loading && (
                <div className="empty-state">
                  <div className="empty-shape">◌</div>
                  <h3>
                    {activeTab === "albums"
                      ? "This album is empty."
                      : activeTab === "favorites"
                        ? "No favorites yet."
                        : "Your library is waiting."}
                  </h3>
                  <p>
                    {activeTab === "albums"
                      ? "Select photos in your library and add them to this album."
                      : activeTab === "favorites"
                        ? "Star an image to keep it close."
                        : "Upload your first image to start shaping the collection."}
                  </p>
                </div>
              )}
                </>
              )}
            </section>
          </section>
        </main>
      )}

      {selectedImage && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeTransform();
          }}
        >
          <section
            className="modal transform-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transformTitle"
          >
            <button
              className="modal-close"
              title="Close"
              aria-label="Close"
              onClick={closeTransform}
            >
              ×
            </button>
            <div className="modal-heading">
              <span className="eyebrow">CREATE A NEW VERSION</span>
              <h2 id="transformTitle">Shape this frame.</h2>
              <p>
                The original stays untouched. Your edited version becomes a new
                S3 asset.
              </p>
            </div>
            <div className="transform-layout">
              <section className="transform-preview-panel" aria-label="Image preview">
                <div className="transform-preview-heading">
                  <span>Live preview</span>
                  <span>Original stays unchanged</span>
                </div>
                <div className="transform-preview-stage">
                  <div
                    className="transform-preview-frame"
                    ref={previewFrame}
                    style={{
                      width:
                        previewBoxAspect < 5 / 4
                          ? `${(previewBoxAspect / (5 / 4)) * 100}%`
                          : "100%",
                      height:
                        previewBoxAspect > 5 / 4
                          ? `${((5 / 4) / previewBoxAspect) * 100}%`
                          : "100%",
                    }}
                  >
                    <Image
                      src={selectedImage.url}
                      alt="Preview of the image being transformed"
                      fill
                      sizes="(max-width: 760px) 90vw, 50vw"
                      unoptimized
                      style={{
                        objectFit: hasCustomDimensions ? "cover" : "contain",
                        filter: previewFilter,
                        transform: cropMode
                          ? "none"
                          : `rotate(${rotation}deg) scale(${previewScale}) scaleX(${transformFields.mirror ? -1 : 1}) scaleY(${transformFields.flip ? -1 : 1})`,
                      }}
                    />
                    {cropMode && (
                      <div
                        className="crop-interaction"
                        ref={cropInteraction}
                        onPointerDown={beginCropGesture}
                        onPointerMove={updateCropGesture}
                        onPointerUp={finishCropGesture}
                        onPointerCancel={() => setCropGesture(null)}
                      >
                        {activeCropSelection ? (
                          <div
                            className="crop-selection"
                            style={{
                              left: `${activeCropSelection.x * 100}%`,
                              top: `${activeCropSelection.y * 100}%`,
                              width: `${activeCropSelection.width * 100}%`,
                              height: `${activeCropSelection.height * 100}%`,
                            }}
                          >
                            {(["nw", "ne", "sw", "se"] as const).map(
                              (corner) => (
                                <button
                                  key={corner}
                                  type="button"
                                  className={`crop-handle crop-handle-${corner}`}
                                  aria-label={`Resize crop ${corner}`}
                                  onPointerDown={(event) => {
                                    event.stopPropagation();
                                    beginCropGesture(
                                      event,
                                      `resize-${corner}` as CropGestureMode,
                                    );
                                  }}
                                />
                              ),
                            )}
                          </div>
                        ) : (
                          <span className="crop-instruction">
                            Drag across the photo to select a crop
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="transform-preview-details">
                  <span>
                    {previewWidth && previewHeight
                      ? `${previewWidth} × ${previewHeight} px`
                      : "Original dimensions"}
                  </span>
                  <span>
                    {transformFields.format
                      ? transformFields.format.toUpperCase()
                      : "Original format"}
                  </span>
                  <span>Quality {quality}%</span>
                </div>
                <div className="crop-tools">
                  <button
                    type="button"
                    className={`crop-mode-button${cropMode ? " is-active" : ""}`}
                    aria-pressed={cropMode}
                    onClick={() => {
                      setCropMode((active) => !active);
                      setCropGesture(null);
                    }}
                  >
                    {cropMode ? "Done cropping" : "Crop photo"}
                  </button>
                  {cropSelection && cropPixelRect && (
                    <>
                      <span className="crop-dimensions">
                        Crop {cropPixelRect.width} × {cropPixelRect.height} px
                      </span>
                      <button
                        type="button"
                        className="crop-reset-button"
                        onClick={() => setCropSelection(null)}
                      >
                        Reset crop
                      </button>
                    </>
                  )}
                </div>
                <p className="crop-help">
                  {cropMode
                    ? "Drag inside the frame to draw or move the crop; use a corner to resize it."
                    : cropSelection
                      ? "Crop area selected. Choose Crop photo to adjust it."
                      : "Crop the photo directly to choose the exact area to keep."}
                </p>
              </section>
              <form className="transform-form" onSubmit={handleTransform}>
              <div className="control-group">
                <label className="field">
                  <span>Width</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="original"
                    value={transformFields.width}
                    onChange={(event) =>
                      setTransformFields((value) => ({
                        ...value,
                        width: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Height</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="original"
                    value={transformFields.height}
                    onChange={(event) =>
                      setTransformFields((value) => ({
                        ...value,
                        height: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="control-group">
                <label className="field">
                  <span>
                    Rotate <b className="rotation-value">{rotation}°</b>
                  </span>
                  <input
                    className="rotation-range"
                    type="range"
                    min="0"
                    max="360"
                    step="1"
                    value={rotation}
                    onChange={(event) =>
                      setRotation(Number(event.target.value))
                    }
                  />
                  <span className="rotation-presets">
                    {[0, 90, 180, 270].map((angle) => (
                      <button
                        key={angle}
                        type="button"
                        onClick={() => setRotation(angle)}
                      >
                        {angle}°
                      </button>
                    ))}
                  </span>
                </label>
                <label className="field">
                  <span>Output</span>
                  <select
                    value={transformFields.format}
                    onChange={(event) =>
                      setTransformFields((value) => ({
                        ...value,
                        format: event.target.value,
                      }))
                    }
                  >
                    <option value="">Keep original</option>
                    <option value="jpeg">JPEG</option>
                    <option value="png">PNG</option>
                    <option value="webp">WebP</option>
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Color look</span>
                <select
                  value={transformFields.color}
                  disabled={transformFields.grayscale || transformFields.sepia}
                  onChange={(event) =>
                    setTransformFields((value) => ({
                      ...value,
                      color: event.target.value,
                    }))
                  }
                >
                  <option value="">Original colors</option>
                  <option value="warm">Warm</option>
                  <option value="cool">Cool</option>
                  <option value="vintage">Vintage</option>
                  <option value="vivid">Vivid</option>
                  <option value="fade">Fade</option>
                </select>
              </label>
              <div className="toggle-grid">
                {(["grayscale", "mirror", "flip", "sepia"] as const).map(
                  (filter) => (
                    <label className="toggle" key={filter}>
                      <input
                        type="checkbox"
                        checked={transformFields[filter]}
                        onChange={(event) =>
                          setTransformFields((value) => ({
                            ...value,
                            [filter]: event.target.checked,
                          }))
                        }
                      />
                      <span className="toggle-ui" />
                      {filter[0].toUpperCase() + filter.slice(1)}
                    </label>
                  ),
                )}
              </div>
              <label className="field quality-field">
                <span>
                  Compression quality <b>{quality}</b>
                </span>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={quality}
                  onChange={(event) => setQuality(Number(event.target.value))}
                />
              </label>
              <button
                className="button button-dark button-wide"
                type="submit"
                disabled={transformBusy}
              >
                {transformBusy
                  ? "Creating version…"
                  : "Create transformed version"}{" "}
                <span>↗</span>
              </button>
              </form>
            </div>
          </section>
        </div>
      )}
      {toast && (
        <div
          className={`toast visible${toast.error ? " error" : ""}`}
          role="status"
        >
          {toast.message}
        </div>
      )}
    </>
  );
}
