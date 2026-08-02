import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Braces,
  Box,
  Check,
  ChevronDown,
  Circle,
  Diamond,
  Download,
  FileCode2,
  Gem,
  Layers3,
  Moon,
  Pentagon,
  Pyramid,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sun,
  Square,
  X,
} from 'lucide-react';
import ModelPreview from './components/ModelPreview';
import { DICTIONARIES, getDictionaryInfo, markerSvg } from './lib/aruco';
import { generateModel } from './lib/geometry';
import { generateStructureJson, structureFilename } from './lib/structureJson';
import { generateStep, stepFilename } from './lib/step';
import { downloadBytes, downloadText, exportFilename, generate3mf } from './lib/threeMf';
import type { DictionaryKey, GeneratorConfig, ShapeKind } from './types';

type Language = 'en' | 'es' | 'pt-BR';
type UnitSystem = 'mm' | 'in';

const COPY: Record<Language, Record<string, string>> = {
  en: { local: 'Local generation', reset: 'Reset', eyebrow: 'FIDUCIAL FABRICATION', hero: 'Make tags that', heroEmphasis: 'machines can see.', export: 'Export dual-color 3MF', geometry: 'Host geometry', choose: 'Choose the printable form', marker: 'Marker identity', dictionary: 'OpenCV-compatible dictionary', print: 'Print construction', construction: 'Surface and layer settings' },
  es: { local: 'Generación local', reset: 'Restablecer', eyebrow: 'FABRICACIÓN FIDUCIAL', hero: 'Crea etiquetas que', heroEmphasis: 'las máquinas pueden ver.', export: 'Exportar 3MF bicolor', geometry: 'Geometría base', choose: 'Elige la forma imprimible', marker: 'Identidad del marcador', dictionary: 'Diccionario compatible con OpenCV', print: 'Construcción de impresión', construction: 'Superficie y capas' },
  'pt-BR': { local: 'Geração local', reset: 'Redefinir', eyebrow: 'FABRICAÇÃO FIDUCIAL', hero: 'Crie tags que', heroEmphasis: 'máquinas podem ver.', export: 'Exportar 3MF em duas cores', geometry: 'Geometria base', choose: 'Escolha a forma imprimível', marker: 'Identidade do marcador', dictionary: 'Dicionário compatível com OpenCV', print: 'Construção de impressão', construction: 'Superfície e camadas' },
};

const DEFAULT_CONFIG: GeneratorConfig = {
  shape: 'cube',
  dictionary: 'DICT_4X4_50',
  markerId: 7,
  markerSize: 36,
  primitiveSize: 50,
  baseThickness: 2.4,
  inkDepth: 0.4,
  quietZoneModules: 1,
  faceCount: 3,
  nozzleDiameter: 0.4,
  layerHeight: 0.2,
};

const SHAPES: Array<{ id: ShapeKind; label: string; subtitle: string; icon: typeof Square }> = [
  { id: 'tag', label: 'Tag', subtitle: 'Flat plaque', icon: Square },
  { id: 'cube', label: 'Cube', subtitle: '1–6 faces', icon: Box },
  { id: 'cylinder', label: 'Cylinder', subtitle: 'Top face', icon: Circle },
  { id: 'tetrahedron', label: 'Tetrahedron', subtitle: '4 faces', icon: Pyramid },
  { id: 'octahedron', label: 'Octahedron', subtitle: '8 faces', icon: Diamond },
  { id: 'dodecahedron', label: 'Dodecahedron', subtitle: '12 faces', icon: Pentagon },
  { id: 'icosahedron', label: 'Icosahedron', subtitle: '20 faces', icon: Gem },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [toast, setToast] = useState('');
  const [tagIdsText, setTagIdsText] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('mm');
  const [darkMode, setDarkMode] = useState(false);
  const copy = COPY[language];
  const dictionary = getDictionaryInfo(config.dictionary);
  const model = useMemo(() => generateModel(config), [config]);
  const markerMinimum = config.shape === 'icosahedron' ? 6 : config.shape === 'octahedron' ? 8 : config.shape === 'tetrahedron' ? 10 : 18;
  const activeMarkerId = config.shape === 'tag' && config.markerIds?.length ? config.markerIds[0] : config.markerId;
  const svg = useMemo(() => markerSvg(config.dictionary, activeMarkerId, config.quietZoneModules), [config.dictionary, activeMarkerId, config.quietZoneModules]);

  const update = <K extends keyof GeneratorConfig>(key: K, value: GeneratorConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const updateTagGridIds = (text: string) => {
    setTagIdsText(text);
    const ids = text.split(/[\s,;]+/).filter(Boolean).map(Number).filter((id) => Number.isInteger(id) && id >= 0 && id < dictionary.count);
    setConfig((current) => ({ ...current, markerIds: ids.length ? ids : undefined, markerId: ids[0] ?? current.markerId }));
  };

  const chooseShape = (shape: ShapeKind) => {
    const platonic = !['tag', 'cube', 'cylinder'].includes(shape);
    setConfig((current) => ({
      ...current,
      shape,
      markerSize: shape === 'tag' ? 40 : shape === 'cube' ? 36 : shape === 'cylinder' ? 32 : shape === 'tetrahedron' ? 18 : shape === 'octahedron' ? 12 : shape === 'dodecahedron' ? 16 : 10,
      primitiveSize: shape === 'cylinder' ? 64 : shape === 'tetrahedron' ? 100 : platonic ? 80 : 50,
      faceCount: shape === 'cube' ? current.faceCount : 1,
    }));
  };

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  };

  const export3mf = () => {
    if (!model.valid) return;
    const bytes = generate3mf(model, config);
    downloadBytes(bytes, exportFilename(config), 'model/3mf');
    notify(`3MF exported · ${(bytes.byteLength / 1024).toFixed(0)} KB`);
  };

  const exportSvg = () => {
    downloadText(svg, `aruco-${config.dictionary.toLowerCase()}-id${config.markerId}.svg`, 'image/svg+xml');
    notify('2D SVG reference exported');
  };

  const exportJson = () => {
    downloadText(generateStructureJson(model, config), structureFilename(config), 'application/json');
    notify(`Structure JSON exported · ${model.markerPlacements.length} marker${model.markerPlacements.length === 1 ? '' : 's'}`);
  };

  const exportStep = () => {
    if (!model.valid) return;
    const step = generateStep(model, config);
    downloadText(step, stepFilename(config), 'application/step');
    notify(`STEP exported · ${(new Blob([step]).size / 1024).toFixed(0)} KB`);
  };

  return (
    <div className={`app-shell${darkMode ? ' dark-mode' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
          <div><strong>ArUco</strong><span>3D Studio</span></div>
          <i>VITRUS LABS</i>
        </div>
        <div className="top-status">
          <span><ShieldCheck size={15} /> {copy.local}</span>
          <label className="compact-select" title="Language"><select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">🇺🇸 EN</option><option value="es">🇪🇸 ES</option><option value="pt-BR">🇧🇷 PT</option></select><ChevronDown size={12} /></label>
          <label className="compact-select" title="Measurement units"><select aria-label="Measurement units" value={unitSystem} onChange={(event) => setUnitSystem(event.target.value as UnitSystem)}><option value="mm">mm</option><option value="in">in</option></select><ChevronDown size={12} /></label>
          <button className="theme-toggle" title={darkMode ? 'Use light mode' : 'Use dark mode'} aria-label={darkMode ? 'Use light mode' : 'Use dark mode'} onClick={() => setDarkMode((value) => !value)}>{darkMode ? <Sun size={15} /> : <Moon size={15} />}</button>
        </div>
      </header>

      <main>
        <section className="hero-row">
          <div>
            <p className="eyebrow"><ScanLine size={14} /> {copy.eyebrow}</p>
            <h1>{copy.hero}<br /><em>{copy.heroEmphasis}</em></h1>
          </div>
          <p className="hero-copy">Generate calibrated ArUco geometry and export a two-body 3MF for Bambu Studio, a reconstruction JSON, or faceted STEP geometry for CAD.</p>
        </section>

        <section className="export-card primary-export-card" aria-label="Export generated model">
          <div className="export-summary">
            <span className="file-icon">3MF</span>
            <div><strong>{exportFilename(config)}</strong><small>{model.dimensions.map((value) => formatDimension(value, unitSystem)).join(' × ')} {unitSystem} · {model.triangles.toLocaleString()} triangles · 2 materials</small></div>
          </div>
          <div className="export-actions">
            <button className="json-button" onClick={exportJson}><Braces size={18} /> JSON</button>
            <button className="svg-button" onClick={exportSvg}><FileCode2 size={18} /> SVG</button>
            <button className="step-button" disabled={!model.valid} onClick={exportStep}><Box size={18} /> STEP</button>
            <button className="export-button" disabled={!model.valid} onClick={export3mf}><Download size={19} /> {copy.export}</button>
          </div>
        </section>

        <div className="studio-grid">
          <aside className="control-column">
            <section className="control-card">
              <div className="section-heading"><span>01</span><div><h2>{copy.geometry}</h2><p>{copy.choose}</p></div></div>
              <div className="shape-grid">
                {SHAPES.map(({ id, label, subtitle, icon: Icon }) => (
                  <button key={id} className={config.shape === id ? 'active' : ''} onClick={() => chooseShape(id)}>
                    <Icon size={20} strokeWidth={1.7} /><strong>{label}</strong><small>{subtitle}</small>
                  </button>
                ))}
              </div>
              {config.shape !== 'tag' && (
                <RangeField label={config.shape === 'cube' ? 'Cube size' : config.shape === 'cylinder' ? 'Cylinder diameter' : 'Circumscribed diameter'} value={config.primitiveSize} min={30} max={140} step={1} unitSystem={unitSystem} onChange={(value) => update('primitiveSize', value)} />
              )}
              {config.shape === 'cube' && (
                <div className="field-row compact">
                  <div><label>Tagged faces</label><small>Sequential marker IDs</small></div>
                  <div className="segmented">
                    {([1, 3, 5, 6] as const).map((count) => <button key={count} className={config.faceCount === count ? 'active' : ''} onClick={() => update('faceCount', count)}>{count}</button>)}
                  </div>
                </div>
              )}
            </section>

            <section className="control-card">
              <div className="section-heading"><span>02</span><div><h2>{copy.marker}</h2><p>{copy.dictionary}</p></div></div>
              <div className="marker-config-row">
                <div className="marker-paper" dangerouslySetInnerHTML={{ __html: svg }} />
                <div className="marker-fields">
                  <label className="select-label">Dictionary
                    <span className="select-wrap">
                      <select value={config.dictionary} onChange={(event) => {
                        const next = event.target.value as DictionaryKey;
                        const max = getDictionaryInfo(next).count - 1;
                        setConfig((current) => ({ ...current, dictionary: next, markerId: Math.min(current.markerId, max), markerIds: current.markerIds?.map((id) => Math.min(id, max)) }));
                      }}>
                        {DICTIONARIES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                      </select><ChevronDown size={14} />
                    </span>
                  </label>
                  <label className="number-label">Marker ID
                    <span className="id-input">
                      <input type="number" min={0} max={dictionary.count - 1} value={config.markerId} onChange={(event) => update('markerId', clamp(Number(event.target.value), 0, dictionary.count - 1))} />
                      <button title="Random ID" onClick={() => update('markerId', Math.floor(Math.random() * dictionary.count))}><RefreshCw size={14} /></button>
                    </span>
                    <small>0–{dictionary.count - 1}{model.faceIds.length > 1 ? ` · faces use ${model.faceIds.join(', ')}` : ''}</small>
                  </label>
                </div>
              </div>
              {config.shape === 'tag' && (
                <label className="tag-grid-input">Tag ID grid
                  <span>Paste IDs separated by commas, spaces, or lines</span>
                  <input value={tagIdsText} placeholder={`e.g. ${config.markerId}, 8, 9, 10`} onChange={(event) => updateTagGridIds(event.target.value)} />
                  <small>{model.markerPlacements.length} tag{model.markerPlacements.length === 1 ? '' : 's'} · arranged automatically in the 3D grid</small>
                </label>
              )}
              <RangeField label="Black border span" value={config.markerSize} min={markerMinimum} max={70} step={1} unitSystem={unitSystem} onChange={(value) => update('markerSize', value)} note={`${formatDimension(model.modulePitch, unitSystem)} ${unitSystem} per module`} />
              <div className="field-row compact">
                <div><label>Quiet zone</label><small>White clearance around border</small></div>
                <div className="segmented wide">
                  {([0, 1, 2] as const).map((count) => <button key={count} className={config.quietZoneModules === count ? 'active' : ''} onClick={() => update('quietZoneModules', count)}>{count}</button>)}
                </div>
              </div>
            </section>

            <section className="control-card">
              <div className="section-heading"><span>03</span><div><h2>{copy.print}</h2><p>{copy.construction}</p></div></div>
              {config.shape === 'tag' && <RangeField label="Base thickness" value={config.baseThickness} min={1.2} max={6} step={0.2} unitSystem={unitSystem} onChange={(value) => update('baseThickness', value)} />}
              <RangeField label="Black relief height" value={config.inkDepth} min={0.2} max={1.2} step={0.2} unitSystem={unitSystem} onChange={(value) => update('inkDepth', value)} note="Raised for easy bucket painting" />
              <div className="dual-fields">
                <NumberField label="Nozzle" value={config.nozzleDiameter} min={0.2} max={1} step={0.2} unitSystem={unitSystem} onChange={(value) => update('nozzleDiameter', value)} />
                <NumberField label="Layer" value={config.layerHeight} min={0.08} max={0.4} step={0.02} unitSystem={unitSystem} onChange={(value) => update('layerHeight', value)} />
              </div>
            </section>
          </aside>

          <section className="workspace-column">
            <ModelPreview model={model} config={config} />

            <div className="details-grid">
              <section className="spec-card">
                <div className="card-title"><Layers3 size={17} /><div><h3>Model composition</h3><p>Two named material bodies</p></div></div>
                <div className="material-row"><span className="swatch white" /><div><strong>Base — White</strong><small>PLA / PETG · Body 01</small></div><b>1</b></div>
                <div className="material-row"><span className="swatch black" /><div><strong>ArUco Ink — Black</strong><small>PLA / PETG · Body 02</small></div><b>{model.faceIds.length}</b></div>
              </section>

              <section className="spec-card readiness-card">
                <div className="card-title"><ShieldCheck size={17} /><div><h3>Print readiness</h3><p>Geometry preflight</p></div><span className={`score ${model.valid ? 'ready' : 'blocked'}`}>{model.valid ? 'READY' : 'CHECK'}</span></div>
                <div className="check-list">
                  {model.checks.map((check) => (
                    <div key={check.label} className={check.status}>
                      <span>{check.status === 'pass' ? <Check size={13} /> : check.status === 'warn' ? <AlertTriangle size={13} /> : <X size={13} />}</span>
                      <div><strong>{check.label}</strong><small>{check.detail}</small></div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

          </section>
        </div>
      </main>

      <footer><span>Generated locally in your browser</span><span>OpenCV dictionaries · 3MF Core 1.3 · faceted STEP · millimeters</span></footer>
      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </div>
  );
}

function displayValue(valueMm: number, unitSystem: UnitSystem) {
  return unitSystem === 'in' ? valueMm / 25.4 : valueMm;
}

function formatDimension(valueMm: number, unitSystem: UnitSystem) {
  return displayValue(valueMm, unitSystem).toFixed(unitSystem === 'in' ? 3 : 1);
}

function RangeField({ label, value, min, max, step, unitSystem, note, onChange }: { label: string; value: number; min: number; max: number; step: number; unitSystem: UnitSystem; note?: string; onChange: (value: number) => void }) {
  const factor = unitSystem === 'in' ? 25.4 : 1;
  const displayedValue = displayValue(value, unitSystem);
  const displayedMin = min / factor;
  const displayedMax = max / factor;
  const displayedStep = step / factor;
  const percentage = ((value - min) / (max - min)) * 100;
  return (
    <div className="range-field">
      <div><label>{label}</label>{note && <small>{note}</small>}<span><input type="number" value={Number(formatDimension(value, unitSystem))} min={displayedMin} max={displayedMax} step={displayedStep} onChange={(event) => onChange(clamp(Number(event.target.value) * factor, min, max))} /><i>{unitSystem}</i></span></div>
      <input aria-label={label} className="range" style={{ '--fill': `${percentage}%` } as React.CSSProperties} type="range" value={displayedValue} min={displayedMin} max={displayedMax} step={displayedStep} onChange={(event) => onChange(Number(event.target.value) * factor)} />
    </div>
  );
}

function NumberField({ label, value, min, max, step, unitSystem, onChange }: { label: string; value: number; min: number; max: number; step: number; unitSystem: UnitSystem; onChange: (value: number) => void }) {
  const factor = unitSystem === 'in' ? 25.4 : 1;
  return <label className="mini-number">{label}<span><input type="number" value={Number(formatDimension(value, unitSystem))} min={min / factor} max={max / factor} step={step / factor} onChange={(event) => onChange(clamp(Number(event.target.value) * factor, min, max))} /><i>{unitSystem}</i></span></label>;
}

export default App;
