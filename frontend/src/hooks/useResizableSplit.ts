import { useRef } from 'react';
import useNetViewLayoutStorage from './useNetViewLayoutStorage';

export type SplitDirection = 'row' | 'column';

// Persisted flex-grow weights for a set of resizable panes sharing one flex
// container, keyed by pane key. A pane not yet in storage defaults to
// weight 1 (equal share). Panes that are minimized/collapsed should NOT use
// these weights - they keep their existing `flex: '0 0 auto'` sizing and
// simply aren't part of the resizable pool (no ResizeHandle rendered next
// to them - see NetViewLeftPanels.tsx / NetViewSidePanels.tsx).
//
// Drag math updates DOM styles directly during mousemove (no React
// re-render per pixel) and only commits the final weights - and the one
// resulting re-render/localStorage write - on mouseup/touchend. `direction`
// matches the CSS flexDirection of the container the panes live in: 'row'
// for side-by-side columns (drag tracks clientX), 'column' for stacked
// panes (drag tracks clientY).
export function useResizableSplit(storageKey: string, direction: SplitDirection) {
  const [weights, setWeights] = useNetViewLayoutStorage<Record<string, number>>(storageKey, {});
  const containerRef = useRef<HTMLDivElement>(null);

  // fallback lets a caller seed the starting ratio (e.g. the existing fixed
  // 3/6/3 column split) instead of always defaulting to an equal 1:1 share.
  const getWeight = (key: string, fallback = 1): number => weights[key] ?? fallback;

  const startDrag = (keyA: string, keyB: string, fallbackA = 1, fallbackB = 1) => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const paneA = container.querySelector<HTMLElement>(`[data-pane-key="${keyA}"]`);
    const paneB = container.querySelector<HTMLElement>(`[data-pane-key="${keyB}"]`);
    if (!paneA || !paneB) return;

    const rect = container.getBoundingClientRect();
    const containerSize = direction === 'row' ? rect.width : rect.height;
    const getPos = (ev: MouseEvent | TouchEvent) => {
      const point = 'touches' in ev ? ev.touches[0] : ev;
      return direction === 'row' ? point.clientX : point.clientY;
    };
    const startPos = getPos(e.nativeEvent);
    const startWeightA = getWeight(keyA, fallbackA);
    const startWeightB = getWeight(keyB, fallbackB);
    const totalWeight = startWeightA + startWeightB;
    const minWeight = totalWeight * 0.15;
    let finalWeightA = startWeightA;

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      const deltaPx = getPos(ev) - startPos;
      const deltaWeight = (deltaPx / containerSize) * totalWeight;
      finalWeightA = Math.max(minWeight, Math.min(totalWeight - minWeight, startWeightA + deltaWeight));
      const finalWeightB = totalWeight - finalWeightA;
      paneA.style.flexGrow = String(finalWeightA);
      paneB.style.flexGrow = String(finalWeightB);
    };
    const stopDrag = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', stopDrag);
      setWeights({ ...weights, [keyA]: finalWeightA, [keyB]: totalWeight - finalWeightA });
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', stopDrag);
  };

  return { containerRef, getWeight, startDrag };
}

export default useResizableSplit;
