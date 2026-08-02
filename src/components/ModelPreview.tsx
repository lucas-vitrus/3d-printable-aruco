import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Box, Circle, Crosshair, Gem, LayoutGrid, RotateCcw, ScanLine, Square, X } from 'lucide-react';
import { markerSvg } from '../lib/aruco';
import type { GeneratedModel, GeneratorConfig, MeshData } from '../types';

type ViewName = 'iso' | 'top' | 'front';

function toGeometry(data: MeshData) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setIndex(data.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function PrintableMesh({ data, color, roughness }: { data: MeshData; color: string; roughness: number }) {
  const geometry = useMemo(() => toGeometry(data), [data]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={roughness} metalness={0.02} />
    </mesh>
  );
}

function CameraRig({ model, view, autoRotate }: { model: GeneratedModel; view: ViewName; autoRotate: boolean }) {
  const { camera } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const maxDimension = Math.max(...model.dimensions);
  const centerZ = model.dimensions[2] / 2;

  useEffect(() => {
    const distance = Math.max(55, maxDimension * 2.15);
    camera.up.set(0, 0, 1);
    if (view === 'top') {
      camera.up.set(0, 1, 0);
      camera.position.set(0, 0, distance * 1.3);
    } else if (view === 'front') {
      camera.position.set(0, -distance * 1.25, centerZ);
    } else {
      camera.position.set(distance, -distance, distance * 0.8);
    }
    camera.lookAt(0, 0, centerZ);
    controls.current?.target.set(0, 0, centerZ);
    controls.current?.update();
  }, [camera, centerZ, maxDimension, view]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[0, 0, centerZ]}
      autoRotate={autoRotate}
      autoRotateSpeed={0.75}
      enableDamping
      dampingFactor={0.06}
      minDistance={maxDimension * 0.7}
      maxDistance={maxDimension * 5}
    />
  );
}

const shapeIcon = (shape: GeneratorConfig['shape']) => {
  if (shape === 'cube') return <Box size={13} />;
  if (shape === 'cylinder') return <Circle size={13} />;
  if (shape === 'tag') return <Square size={13} />;
  return <Gem size={13} />;
};

export default function ModelPreview({ model, config }: { model: GeneratedModel; config: GeneratorConfig }) {
  const [view, setView] = useState<ViewName>('iso');
  const [autoRotate, setAutoRotate] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);

  return (
    <section className="preview-panel" aria-label="3D print preview">
      <div className="preview-toolbar">
        <div className="preview-title">
          <span className="live-dot" />
          <strong>Live geometry</strong>
          <span className="shape-chip">{shapeIcon(config.shape)} {config.shape}</span>
        </div>
        <div className="view-tools" aria-label="Camera view">
          <button className={view === 'iso' ? 'active' : ''} onClick={() => setView('iso')} title="Isometric view"><ScanLine size={15} /></button>
          <button className={view === 'top' ? 'active' : ''} onClick={() => setView('top')} title="Top view"><Crosshair size={15} /></button>
          <button className={view === 'front' ? 'active' : ''} onClick={() => setView('front')} title="Front view"><Square size={14} /></button>
          <span className="tool-divider" />
          <button className={`tags-toggle ${showAllTags ? 'active' : ''}`} onClick={() => setShowAllTags((value) => !value)} title="Display all tags" aria-pressed={showAllTags}><LayoutGrid size={15} /><span>All tags</span></button>
          <button className={autoRotate ? 'active' : ''} onClick={() => setAutoRotate((value) => !value)} title="Toggle auto rotate"><RotateCcw size={15} /></button>
        </div>
      </div>
      <div className="canvas-wrap">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ fov: 32, near: 0.1, far: 3000, position: [90, -90, 75], up: [0, 0, 1] }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        >
          <ambientLight intensity={1.15} />
          <directionalLight position={[70, -45, 100]} intensity={2.8} castShadow shadow-mapSize={[2048, 2048]} />
          <directionalLight position={[-60, 30, 50]} intensity={1.2} color="#dbe8dd" />
          <group>
            <PrintableMesh data={model.base} color="#eeeae0" roughness={0.72} />
            <PrintableMesh data={model.ink} color="#171817" roughness={0.52} />
          </group>
          <gridHelper args={[240, 40, '#b5b7ae', '#dedfd9']} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.06]} />
          <CameraRig model={model} view={view} autoRotate={autoRotate} />
        </Canvas>
        <div className="axis-widget" aria-hidden="true">
          <i className="axis-z" /> <span>Z</span>
          <i className="axis-x" /> <span>X</span>
          <i className="axis-y" /> <span>Y</span>
        </div>
        {showAllTags && (
          <aside className="tag-inventory" aria-label="All marker tags">
            <header>
              <div><strong>Tag inventory</strong><small>{config.dictionary} · {model.markerPlacements.length} marker{model.markerPlacements.length === 1 ? '' : 's'}</small></div>
              <button onClick={() => setShowAllTags(false)} aria-label="Close all tags"><X size={15} /></button>
            </header>
            <div className={`tag-inventory-grid count-${model.markerPlacements.length}`}>
              {model.markerPlacements.map((placement) => (
                <article key={`${placement.name}-${placement.markerId}`}>
                  <div className="tag-thumbnail" dangerouslySetInnerHTML={{ __html: markerSvg(config.dictionary, placement.markerId, config.quietZoneModules) }} />
                  <div><strong>ID {placement.markerId}</strong><small>{placement.name} face</small></div>
                </article>
              ))}
            </div>
          </aside>
        )}
        <div className="canvas-hint">Drag to orbit · Scroll to zoom</div>
      </div>
    </section>
  );
}
