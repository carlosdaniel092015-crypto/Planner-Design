// Hand-made camera for the gallery photos: a live 3D viewer to orbit, zoom and pan, then "Usar esta vista".
import type { CameraState } from '@core';
import { useRef } from 'react';
import type { Viewer } from '../editor/engine';
import { Viewer3D } from '../editor/Viewer3D';
import { Dialog, Icon, MUTED } from '../ui';

export function CameraDialog(props: {
  title: string;
  cfg: unknown;
  /** Camera to start from (the one saved before). */
  initial?: CameraState;
  /** Module to frame when there is no saved camera (detail view). */
  focusId?: number;
  onSave: (cam: CameraState) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const viewer = useRef<Viewer | null>(null);
  return (
    <Dialog
      title={props.title}
      onClose={props.onClose}
      width={1100}
      actions={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              props.onReset();
              props.onClose();
            }}
          >
            <Icon name="wand-sparkles" size={15} />
            Vista automática
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-secondary" onClick={props.onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const v = viewer.current;
              if (v) props.onSave(v.getCamera());
              props.onClose();
            }}
          >
            <Icon name="camera" size={15} />
            Usar esta vista
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 10px', fontSize: 13, color: MUTED }}>Arrastra para girar · rueda o pellizco para acercar · clic derecho (o dos dedos) para mover. La foto de la galería, el PDF y la página del cliente usarán esta toma.</p>
      {/* Never let the viewer collapse: dragging on a 0 px tall canvas makes OrbitControls divide by zero (NaN camera). */}
      <div style={{ position: 'relative', height: 'min(62vh, 620px)', minHeight: 320, flex: 'none', background: 'var(--sp-canvas)' }}>
        <Viewer3D
          cfg={props.cfg}
          onSelect={() => {}}
          onViewer={(v) => {
            viewer.current = v;
          }}
          onLoaded={(v) => {
            if (props.initial) v.setCamera(props.initial);
            else if (props.focusId != null) v.focus(props.focusId);
          }}
          fallback={<p style={{ padding: 20 }}>El visor 3D no está disponible en este dispositivo.</p>}
        />
      </div>
    </Dialog>
  );
}
