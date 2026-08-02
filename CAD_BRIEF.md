# CAD brief

- Model: parametric ArUco tag generator with flat tag, cube, cylinder, tetrahedron, octahedron, dodecahedron, and icosahedron hosts.
- Task type: browser-native generation system with secondary 3MF and SVG outputs, not one fixed CAD part.
- Units: millimeters.
- Coordinate convention: host centered on XY; build plate at Z = 0; +Z is up.
- Marker geometry: OpenCV predefined 4×4 through 7×7 dictionaries; one black border module; configurable white quiet zone.
- Material bodies: `Base — White` and `ArUco Ink — Black` are separate, closed triangle shells in one 3MF component assembly.
- Surface construction: every tagged face is a complete tiled inlay layer. White and black closed volumes share boundaries, never overlap, and terminate on the same finished plane. Cube face layers are partitioned at edges so 1-, 3-, and 6-face variants remain fully supported.
- Platonic construction: regular solids sized by circumscribed diameter, translated to the build plate, with deterministic local frames and one sequential marker on every face.
- Outputs: browser-downloaded `.3mf`, faceted AP214-compatible `.step`, reference `.svg`, and self-contained `.structure.json`; all geometry and spatial metadata are regenerated from current UI parameters.
- Manufacturing assumptions: FDM, nominal 0.4 mm nozzle, 0.20 mm layers, at least one quiet-zone module, and black module width at least one nozzle diameter (two preferred).
- STEP scope: AP214 `ADVANCED_BREP_SHAPE_REPRESENTATION` with closed planar `MANIFOLD_SOLID_BREP` components, explicit vertices/shared edge curves/face surfaces, printable white/black geometry, and ASCII-safe names for Rhino import; no parametric feature history.
- Validation targets: exact marker bit sequence, Platonic face counts (4/6/8/12/20), positive dimensions, no negative-Z geometry, identical black/white surface extents, closed triangle shells, two material resources, one component assembly, required OPC/3MF package entries, faceted STEP entities, invertible marker/object frame transforms, complete face inventory, and fit/readiness checks before export.
