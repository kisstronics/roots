import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Person } from "../types";
import { CARD_H, CARD_W, layoutFullTree } from "../lib/layout";
import { indexPeople } from "../lib/people";
import { PersonCard } from "./PersonCard";

interface TreeCanvasProps {
  people: Person[];
  selectedId: string | null;
  revealId: string | null;
  revealNonce: number;
  onSelectPerson: (id: string) => void;
  onOpenPerson: (id: string) => void;
  onBackground: () => void;
}

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 2.4;

export function TreeCanvas({
  people,
  selectedId,
  revealId,
  revealNonce,
  onSelectPerson,
  onOpenPerson,
  onBackground,
}: TreeCanvasProps) {
  const layout = useMemo(() => layoutFullTree(people), [people]);
  const byId = useMemo(() => indexPeople(people), [people]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 24, y: 24 });
  const zoomAtRef = useRef<(mx: number, my: number, next: number) => void>(() => undefined);
  const fitRef = useRef<() => void>(() => undefined);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const movedByUser = useRef(false);
  const didFit = useRef(false);
  const positionsRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  const heldPersonRef = useRef<string | null>(selectedId);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const pinchActive = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchBase = useRef<{ distance: number; scale: number } | null>(null);

  zoomAtRef.current = (mx, my, next) => {
    const current = scaleRef.current;
    const origin = panRef.current;
    const worldX = (mx - origin.x) / current;
    const worldY = (my - origin.y) / current;
    const nextPan = { x: mx - worldX * next, y: my - worldY * next };
    scaleRef.current = next;
    panRef.current = nextPan;
    setScale(next);
    setPan(nextPan);
  };

  const zoomAroundCenter = (factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    movedByUser.current = true;
    const rect = viewport.getBoundingClientRect();
    zoomAtRef.current(rect.width / 2, rect.height / 2, clamp(scaleRef.current * factor, MIN_ZOOM, MAX_ZOOM));
  };

  const fit = () => {
    const viewport = viewportRef.current;
    if (!viewport || !layout) return;
    const rect = viewport.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) return;
    const next = clamp(
      Math.min((rect.width - 32) / layout.width, (rect.height - 32) / layout.height),
      MIN_ZOOM,
      1,
    );
    const nextPan = {
      x: (rect.width - layout.width * next) / 2,
      y: Math.max(12, (rect.height - layout.height * next) / 2),
    };
    scaleRef.current = next;
    panRef.current = nextPan;
    setScale(next);
    setPan(nextPan);
  };
  fitRef.current = fit;

  useEffect(() => {
    if (didFit.current) return;
    const frame = requestAnimationFrame(() => {
      fitRef.current();
      didFit.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [layout]);

  useLayoutEffect(() => {
    if (!layout) return;
    const nextPositions = new Map(layout.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
    const previous = positionsRef.current;
    const heldId = heldPersonRef.current;
    if (previous && didFit.current) {
      const anchorId =
        (heldId && previous.has(heldId) && nextPositions.has(heldId) && heldId) ||
        (selectedId && previous.has(selectedId) && nextPositions.has(selectedId) && selectedId) ||
        [...previous.keys()].find((id) => nextPositions.has(id)) ||
        null;
      if (anchorId) {
        const before = previous.get(anchorId)!;
        const after = nextPositions.get(anchorId)!;
        const scale = scaleRef.current;
        const x = panRef.current.x + (before.x - after.x) * scale;
        const y = panRef.current.y + (before.y - after.y) * scale;
        if (Math.abs(x - panRef.current.x) > 0.5 || Math.abs(y - panRef.current.y) > 0.5) {
          const nextPan = { x, y };
          panRef.current = nextPan;
          setPan(nextPan);
        }
      }
    }
    positionsRef.current = nextPositions;
    heldPersonRef.current = selectedId;
  }, [layout, selectedId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (movedByUser.current) return;
      fitRef.current();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const zoomFromClient = (clientX: number, clientY: number, nextScale: number) => {
      const rect = viewport.getBoundingClientRect();
      movedByUser.current = true;
      zoomAtRef.current(clientX - rect.left, clientY - rect.top, clamp(nextScale, MIN_ZOOM, MAX_ZOOM));
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.08 : 0.92;
      zoomFromClient(event.clientX, event.clientY, scaleRef.current * factor);
    };

    const onPinchWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !pointerOverViewport(viewport, event.clientX, event.clientY)) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.03 : 0.01));
      zoomFromClient(event.clientX, event.clientY, scaleRef.current * factor);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("wheel", onPinchWheel, { passive: false, capture: true });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      window.removeEventListener("wheel", onPinchWheel, { capture: true });
    };
  }, []);

  useEffect(() => {
    const currentLayout = layoutRef.current;
    if (!revealNonce || !revealId || !currentLayout) return;
    const node = currentLayout.nodes.find((item) => item.id === revealId);
    const viewport = viewportRef.current;
    if (!node || !viewport) return;
    const rect = viewport.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) return;
    const currentScale = scaleRef.current;
    const origin = panRef.current;
    const left = origin.x + node.x * currentScale;
    const top = origin.y + node.y * currentScale;
    const right = left + CARD_W * currentScale;
    const bottom = top + CARD_H * currentScale;
    const margin = 20;
    let x = origin.x;
    let y = origin.y;
    if (left < margin) x += margin - left;
    else if (right > rect.width - margin) x -= right - (rect.width - margin);
    if (top < margin) y += margin - top;
    else if (bottom > rect.height - margin) y -= bottom - (rect.height - margin);
    if (x === origin.x && y === origin.y) return;
    const next = { x, y };
    panRef.current = next;
    setPan(next);
  }, [revealId, revealNonce]);

  if (!layout) {
    return <div className="viewport empty-viewport">This family has no one to draw.</div>;
  }

  return (
    <div className="canvas-wrap" data-view="full" data-testid="tree-canvas">
      <div
        ref={viewportRef}
        className={dragging ? "viewport is-dragging" : "viewport"}
        onPointerDown={(event) => {
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pointers.current.size >= 2) {
            const pts = [...pointers.current.values()];
            pinchBase.current = {
              distance: Math.max(Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), 1),
              scale: scaleRef.current,
            };
            pinchActive.current = true;
            drag.current = null;
            setDragging(false);
            for (const id of pointers.current.keys()) {
              if (event.currentTarget.hasPointerCapture(id)) continue;
              try {
                event.currentTarget.setPointerCapture(id);
              } catch {
                // The pointer can already be gone if the finger lifted mid-gesture.
              }
            }
            return;
          }
          if ((event.target as HTMLElement).closest("[data-interactive]")) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            panX: panRef.current.x,
            panY: panRef.current.y,
            moved: false,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!pointers.current.has(event.pointerId) && !drag.current) return;
          if (pointers.current.has(event.pointerId)) {
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          }
          if (pinchActive.current && pinchBase.current && pointers.current.size >= 2) {
            const pts = [...pointers.current.values()];
            const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            const rect = event.currentTarget.getBoundingClientRect();
            const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
            const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
            movedByUser.current = true;
            zoomAtRef.current(
              midX,
              midY,
              clamp(pinchBase.current.scale * (distance / pinchBase.current.distance), MIN_ZOOM, MAX_ZOOM),
            );
            return;
          }
          const current = drag.current;
          if (!current) return;
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          if (Math.hypot(dx, dy) > 4) {
            current.moved = true;
            movedByUser.current = true;
          }
          const next = { x: current.panX + dx, y: current.panY + dy };
          panRef.current = next;
          setPan(next);
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId);
          const wasPinch = pinchActive.current;
          if (pointers.current.size < 2) {
            pinchBase.current = null;
            pinchActive.current = false;
          }
          if (wasPinch) {
            drag.current = null;
            setDragging(false);
            return;
          }
          const current = drag.current;
          drag.current = null;
          setDragging(false);
          if (current && !current.moved) onBackground();
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          if (pointers.current.size < 2) {
            pinchBase.current = null;
            pinchActive.current = false;
          }
          drag.current = null;
          setDragging(false);
        }}
      >
        <div
          className="world"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
        >
          {layout.bands.map((band) => (
            <div
              key={band.generation}
              className={`band ${band.generation % 2 === 0 ? "band-even" : "band-odd"}`}
              style={{ top: band.y - 18, height: CARD_H + 32 }}
            />
          ))}
          {layout.bands.map((band) => (
            <div key={`${band.generation}-label`} className="gen-label" data-testid="generation-label" style={{ top: band.y - 16 }}>
              {band.label}
            </div>
          ))}
          <svg className="edges" width={layout.width} height={layout.height}>
            {layout.edges.map((edge) => (
              <g key={edge.id} className="edge-group" data-kind={edge.kind}>
                <path d={edge.d} className="edge">
                  <title>{edge.title}</title>
                </path>
                {edge.d2 && <path d={edge.d2} className="edge" />}
              </g>
            ))}
          </svg>
          {layout.nodes.map((node) => {
            const person = byId.get(node.id);
            if (!person) return null;
            return (
              <PersonCard
                key={node.id}
                person={person}
                x={node.x}
                y={node.y}
                selected={node.id === selectedId}
                onSelect={onSelectPerson}
                onOpen={onOpenPerson}
              />
            );
          })}
        </div>
      </div>
      <div className="zoom-bar" data-interactive="true">
        <button type="button" data-testid="zoom-out" onClick={() => zoomAroundCenter(1 / 1.12)} aria-label="Zoom out">
          −
        </button>
        <span data-testid="zoom-level">{Math.round(scale * 100)}%</span>
        <button type="button" data-testid="zoom-in" onClick={() => zoomAroundCenter(1.12)} aria-label="Zoom in">
          +
        </button>
        <button
          type="button"
          data-testid="zoom-fit"
          onClick={() => {
            movedByUser.current = false;
            fit();
          }}
        >
          Fit
        </button>
      </div>
      <div className="legend" data-interactive="true">
        <span><i className="swatch male" /> Male</span>
        <span><i className="swatch female" /> Female</span>
        <span><i className="swatch parent" /> Parent link</span>
        <span><i className="swatch spouse" /> Spouse link</span>
      </div>
    </div>
  );
}

function pointerOverViewport(viewport: HTMLElement, clientX: number, clientY: number) {
  const rect = viewport.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
