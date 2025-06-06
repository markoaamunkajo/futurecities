import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';

interface RotatingWireframeMapProps {
  color: string; // Color for the wireframe lines
}

const RotatingWireframeMap: React.FC<RotatingWireframeMapProps> = ({ color }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const mapGroupRef = useRef<THREE.Group | null>(null); // Group for terrain and water

  const wireframeColor = useMemo(() => new THREE.Color(color), [color]);
  const waterWireframeColor = useMemo(() => {
    const base = new THREE.Color(color);
    if (base.getHexString() === "000000") { // if black terrain
        return new THREE.Color(0x222222); // very dark grey for water
    }
    return base.clone().multiplyScalar(0.3); // darker shade of terrain color
  }, [color]);


  useEffect(() => {
    if (!mountRef.current || typeof window === 'undefined') return;
    const currentMount = mountRef.current;

    const scene = new THREE.Scene();
    
    const aspect = currentMount.clientWidth / currentMount.clientHeight;
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    camera.position.set(0, 60, 130); // Side-view, slightly elevated
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setClearColor(0x000000, 0); 
    currentMount.appendChild(renderer.domElement);

    mapGroupRef.current = new THREE.Group();
    scene.add(mapGroupRef.current);

    // Terrain Generation
    const planeSize = 120;
    const planeSegments = 30; // Increased segments for more detail
    const maxHeight = 25;
    const terrainGeometry = new THREE.PlaneGeometry(planeSize, planeSize, planeSegments, planeSegments);
    
    const positions = terrainGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i); // This is 'depth' in the plane before rotation

        // More complex height generation: multiple sine waves + noise for variation
        let height = 
            Math.sin(x * 0.05) * Math.cos(y * 0.08) * maxHeight * 0.4 +
            Math.sin(x * 0.15 + y * 0.03) * maxHeight * 0.3 +
            Math.cos(x * 0.02 - y * 0.12) * maxHeight * 0.2 +
            (Math.random() - 0.5) * maxHeight * 0.15; // Add some noise

        // Create a central depression / valley for a potential lake
        const distFromCenter = Math.sqrt(x*x + y*y);
        const valleyFactor = Math.max(0, 1 - (distFromCenter / (planeSize * 0.3))); // Valley in central 30%
        height -= valleyFactor * maxHeight * 0.5; // Make valley deeper

        positions.setZ(i, height); // Displace Z (which becomes Y after rotation)
    }
    terrainGeometry.attributes.position.needsUpdate = true;
    terrainGeometry.computeVertexNormals();
    terrainGeometry.rotateX(-Math.PI / 2); // Rotate to be horizontal (XY plane)

    const terrainEdges = new THREE.EdgesGeometry(terrainGeometry);
    const terrainMaterial = new THREE.LineBasicMaterial({ color: wireframeColor });
    const terrainMesh = new THREE.LineSegments(terrainEdges, terrainMaterial);
    mapGroupRef.current.add(terrainMesh);

    // Water Plane for Lakes
    // Place it at Y=0 or slightly below to represent water level
    const waterLevelY = -2; // Adjust this to set lake depth relative to terrain
    const waterGeometry = new THREE.PlaneGeometry(planeSize * 0.95, planeSize * 0.95, planeSegments/2, planeSegments/2); // Slightly smaller than terrain
    waterGeometry.rotateX(-Math.PI / 2);
    waterGeometry.translate(0, waterLevelY, 0); // Position at water level

    const waterEdges = new THREE.EdgesGeometry(waterGeometry);
    const waterMaterial = new THREE.LineBasicMaterial({ color: waterWireframeColor });
    const waterMesh = new THREE.LineSegments(waterEdges, waterMaterial);
    mapGroupRef.current.add(waterMesh);

    const handleResize = () => {
        if (currentMount) {
            const newWidth = currentMount.clientWidth;
            const newHeight = Math.max(1, currentMount.clientHeight);
            camera.aspect = newWidth / newHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(newWidth, newHeight);
        }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();

    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      if (mapGroupRef.current) {
        mapGroupRef.current.rotation.y += 0.0025; // Slow rotation
      }
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      window.removeEventListener('resize', handleResize);
      if (currentMount && renderer.domElement.parentElement === currentMount) {
        currentMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
      if (mapGroupRef.current) {
        mapGroupRef.current.children.forEach(child => {
            const mesh = child as THREE.LineSegments;
            mesh.geometry.dispose();
            if(Array.isArray(mesh.material)){
                 mesh.material.forEach(m => m.dispose());
            } else {
                (mesh.material as THREE.Material).dispose();
            }
        });
      }
      terrainGeometry.dispose();
      terrainEdges.dispose();
      waterGeometry.dispose();
      waterEdges.dispose();
      scene.clear();
    };
  }, [wireframeColor, waterWireframeColor]);

  return (
    <div ref={mountRef} className="w-full h-full" />
  );
};

export default RotatingWireframeMap;