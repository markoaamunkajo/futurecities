import React, { useRef, useEffect, useMemo, useCallback, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import type { LandscapeData, CityElementData } from '../App';

interface ThreeCityscapeProps {
  landscapeData: LandscapeData | null;
  globalCityColor: string;
  onScreenshotInitiated: () => void;
  generateBuildingCluster: (clusterIdPrefix: string) => Promise<CityElementData[] | null>;
}

export interface ThreeCityscapeHandle {
  turnViewDirection: (direction: 'left' | 'right') => void;
  zoomCameraByFactor: (factor: number) => void;
}

const HIGH_ANGLE_INITIAL_CAMERA_Y = 300;
const HIGH_ANGLE_INITIAL_CAMERA_Z = 100;
const HIGH_ANGLE_FORWARD_SPEED = 0.6; 
const HIGH_ANGLE_LOOK_AT_Y_TARGET = 0;
const HIGH_ANGLE_LOOK_AHEAD_Z = 300; 

const MIN_FOV = 30;
const MAX_FOV = 90;
const DEFAULT_FOV = 60;
const FOV_STEP = 2;

const SCREENSHOT_TARGET_SIZE = 1024;

const KEYBOARD_ROTATION_SPEED = 0.02; 
const MOUSE_AZIMUTH_SENSITIVITY_PER_FRAME = 0.015;

// Constants for Dynamic Cluster Generation
const GENERATION_TRIGGER_DISTANCE = 400; 
const CLUSTER_SPAWN_AHEAD_OFFSET = 600; 
const MIN_DISTANCE_BETWEEN_TRIGGER_POINTS = 300; 
const MAX_ACTIVE_CLUSTER_REQUESTS = 1; 
const FADE_IN_DURATION = 0.35; 
const INTER_CLUSTER_SPACING = 225; // Spacing between centers of adjacent clusters in a multi-cluster spawn


const skyVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const skyFragmentShader = `
  varying vec2 vUv;
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  void main() {
    gl_FragColor = vec4(mix(horizonColor, topColor, vUv.y), 1.0);
  }
`;

const ThreeCityscape: React.ForwardRefRenderFunction<ThreeCityscapeHandle, ThreeCityscapeProps> = (
  { landscapeData, globalCityColor, onScreenshotInitiated, generateBuildingCluster },
  ref
) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const skyMeshRef = useRef<THREE.Mesh | null>(null);
  const cityElementsGroupRef = useRef<THREE.Group | null>(null); // Holds all buildings (initial and dynamic)
  const cameraAzimuthAngleRef = useRef<number>(0); 
  const cameraFovRef = useRef<number>(DEFAULT_FOV); 
  const isCapturingRef = useRef(false); 

  const isRotatingLeftRef = useRef(false);
  const isRotatingRightRef = useRef(false);
  const normalizedMouseXRef = useRef<number>(0);

  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialFovAtPinchStartRef = useRef<number | null>(null);

  const cityColorTHREE = useMemo(() => new THREE.Color(globalCityColor), [globalCityColor]);

  // Refs for dynamic generation
  const dynamicallyGeneratedBuildingsRef = useRef<Set<string>>(new Set());
  const generationTriggerPointsRef = useRef<THREE.Vector3[]>([]);
  const activeClusterRequestsRef = useRef<number>(0);
  const nextClusterIdCounterRef = useRef<number>(0);
  const clockRef = useRef<THREE.Clock | null>(null);


  useImperativeHandle(ref, () => ({
    turnViewDirection: (direction: 'left' | 'right') => {
      const turnAngle = Math.PI / 4; 
      if (direction === 'left') {
        cameraAzimuthAngleRef.current -= turnAngle;
      } else {
        cameraAzimuthAngleRef.current += turnAngle;
      }
    },
    zoomCameraByFactor: (factor: number) => {
      if (!cameraRef.current) return;
      const fovChange = DEFAULT_FOV * factor;
      cameraFovRef.current = Math.max(MIN_FOV, Math.min(MAX_FOV, cameraFovRef.current + fovChange));
    }
  }));

  const createOrUpdateLineSegments = useCallback((elementData: CityElementData, existingSegments?: THREE.LineSegments, isDynamicFadeIn: boolean = false): THREE.LineSegments => {
    let geometry: THREE.BufferGeometry;
    if (elementData.shape === 'box' && elementData.dimensions.width && elementData.dimensions.height && elementData.dimensions.depth) {
      geometry = new THREE.BoxGeometry(elementData.dimensions.width, elementData.dimensions.height, elementData.dimensions.depth);
    } else if (elementData.shape === 'cylinder' && elementData.dimensions.radius && elementData.dimensions.height) {
      const cylinderGeom = new THREE.CylinderGeometry(elementData.dimensions.radius, elementData.dimensions.radius, elementData.dimensions.height, 16, 1, false);
      geometry = new THREE.EdgesGeometry(cylinderGeom);
      cylinderGeom.dispose();
    } else { 
      geometry = new THREE.BoxGeometry(10, 10, 10); 
    }
    
    const edges = (geometry instanceof THREE.EdgesGeometry) ? geometry : new THREE.EdgesGeometry(geometry);
    if (!(geometry instanceof THREE.EdgesGeometry)) geometry.dispose();


    if (existingSegments) {
      existingSegments.geometry.dispose();
      existingSegments.geometry = edges;
      const mat = existingSegments.material as THREE.LineBasicMaterial;
      mat.color.copy(cityColorTHREE);
      if (isDynamicFadeIn && clockRef.current) {
        mat.transparent = true;
        mat.opacity = 0.01; // Start almost invisible
        existingSegments.userData.isDynamicallyGenerated = true;
        existingSegments.userData.isAppearing = true;
        existingSegments.userData.creationTime = clockRef.current.getElapsedTime();
      } else {
        mat.opacity = 1.0;
        mat.transparent = false;
      }
      return existingSegments;
    }
    
    const material = new THREE.LineBasicMaterial({ color: cityColorTHREE });
    if (isDynamicFadeIn && clockRef.current) {
      material.transparent = true;
      material.opacity = 0.01;
    }

    const segments = new THREE.LineSegments(edges, material);
    segments.position.set(elementData.position.x, elementData.position.y + (elementData.dimensions.height || 0) / 2, elementData.position.z);
    if (elementData.orientationY !== undefined) {
      segments.rotation.y = elementData.orientationY;
    }
    segments.userData = { 
      id: elementData.id, 
      height: elementData.dimensions.height || 0,
      ...(isDynamicFadeIn && clockRef.current && {
        isDynamicallyGenerated: true,
        isAppearing: true,
        creationTime: clockRef.current.getElapsedTime()
      })
    };
    return segments;
  }, [cityColorTHREE]);


  const handleCanvasClickAndCapture = useCallback(async () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !mountRef.current || !skyMeshRef.current) return;
    if (isCapturingRef.current) return;

    onScreenshotInitiated();
    isCapturingRef.current = true; 

    const mainRenderer = rendererRef.current; 
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const skyMesh = skyMeshRef.current;
    
    const originalSkyVisible = skyMesh.visible;
    
    let greenCityscapeDataURL: string;
    let whiteCityscapeDataURL: string;

    const originalMaterialColors = new Map<string, THREE.Color>();
    if (cityElementsGroupRef.current) {
        cityElementsGroupRef.current.children.forEach(child => {
            const element = child as THREE.LineSegments;
            if (element.material && (element.material as THREE.LineBasicMaterial).color) {
                const lineMaterial = element.material as THREE.LineBasicMaterial;
                originalMaterialColors.set(element.uuid, lineMaterial.color.clone());
                 // Ensure full opacity for screenshot
                (element.material as THREE.LineBasicMaterial).opacity = 1.0;
                (element.material as THREE.LineBasicMaterial).transparent = false;
            }
        });
    }
    
    const originalAspect = camera.aspect; 

    try {
        camera.aspect = 1.0; 
        camera.updateProjectionMatrix();

        const offscreenCanvasGreen = document.createElement('canvas');
        offscreenCanvasGreen.width = SCREENSHOT_TARGET_SIZE;
        offscreenCanvasGreen.height = SCREENSHOT_TARGET_SIZE;
        const offscreenRendererGreen = new THREE.WebGLRenderer({
            canvas: offscreenCanvasGreen,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
        });
        offscreenRendererGreen.setPixelRatio(1); 
        offscreenRendererGreen.setSize(SCREENSHOT_TARGET_SIZE, SCREENSHOT_TARGET_SIZE);
        offscreenRendererGreen.setClearColor(0x000000, 1); 

        if (cityElementsGroupRef.current) {
            cityElementsGroupRef.current.children.forEach(child => {
                const element = child as THREE.LineSegments;
                if (element.material) {
                    const mat = element.material as THREE.LineBasicMaterial;
                    if (originalMaterialColors.has(element.uuid)) {
                        mat.color.copy(originalMaterialColors.get(element.uuid)!);
                    } else {
                        mat.color.copy(cityColorTHREE); 
                    }
                }
            });
        }
        skyMesh.visible = false;
        offscreenRendererGreen.render(scene, camera);
        greenCityscapeDataURL = offscreenRendererGreen.domElement.toDataURL('image/png');
        offscreenRendererGreen.dispose();


        if (cityElementsGroupRef.current) {
            cityElementsGroupRef.current.children.forEach(child => {
                const element = child as THREE.LineSegments;
                if (element.material && (element.material as THREE.LineBasicMaterial).color) {
                    (element.material as THREE.LineBasicMaterial).color.setHex(0xffffff); 
                }
            });
        }

        const offscreenCanvasWhite = document.createElement('canvas');
        offscreenCanvasWhite.width = SCREENSHOT_TARGET_SIZE;
        offscreenCanvasWhite.height = SCREENSHOT_TARGET_SIZE;
        const offscreenRendererWhite = new THREE.WebGLRenderer({
            canvas: offscreenCanvasWhite,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
        });
        offscreenRendererWhite.setPixelRatio(1);
        offscreenRendererWhite.setSize(SCREENSHOT_TARGET_SIZE, SCREENSHOT_TARGET_SIZE);
        offscreenRendererWhite.setClearColor(0x000000, 1); 

        offscreenRendererWhite.render(scene, camera);
        whiteCityscapeDataURL = offscreenRendererWhite.domElement.toDataURL('image/png');
        offscreenRendererWhite.dispose();

    } finally {
        camera.aspect = originalAspect; 
        camera.updateProjectionMatrix();

        if (cityElementsGroupRef.current) {
            cityElementsGroupRef.current.children.forEach(child => {
                const element = child as THREE.LineSegments;
                if (element.material && (element.material as THREE.LineBasicMaterial).color) {
                    const mat = element.material as THREE.LineBasicMaterial;
                    if (originalMaterialColors.has(element.uuid)) {
                        mat.color.copy(originalMaterialColors.get(element.uuid)!);
                    } else {
                        mat.color.copy(cityColorTHREE); 
                    }
                    // Restore opacity if it was dynamic
                    if (element.userData.isDynamicallyGenerated && element.userData.isAppearing && clockRef.current) {
                       mat.opacity = Math.min(1, (clockRef.current.getElapsedTime() - element.userData.creationTime) / FADE_IN_DURATION);
                       mat.transparent = true;
                    } else if (element.userData.isDynamicallyGenerated && !element.userData.isAppearing) {
                        mat.opacity = 1.0;
                        mat.transparent = true; // Keep transparent true if it was for dynamic elements for simplicity
                    } else {
                        mat.opacity = 1.0;
                        mat.transparent = false;
                    }
                }
            });
        }
        
        skyMesh.visible = originalSkyVisible;
        isCapturingRef.current = false; 
    }
    
    const greenImg = new Image();
    const whiteImg = new Image();

    try {
        const [loadedGreenImg, loadedWhiteImg] = await Promise.all([
            new Promise<HTMLImageElement>((resolve, reject) => {
                greenImg.onload = () => resolve(greenImg);
                greenImg.onerror = (e) => reject(new Error("Failed to load green cityscape image: " + String(e)));
                greenImg.src = greenCityscapeDataURL;
            }),
            new Promise<HTMLImageElement>((resolve, reject) => {
                whiteImg.onload = () => resolve(whiteImg);
                whiteImg.onerror = (e) => reject(new Error("Failed to load white cityscape image: " + String(e)));
                whiteImg.src = whiteCityscapeDataURL;
            })
        ]);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = SCREENSHOT_TARGET_SIZE;
        tempCanvas.height = SCREENSHOT_TARGET_SIZE;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(loadedGreenImg, 0, 0, SCREENSHOT_TARGET_SIZE, SCREENSHOT_TARGET_SIZE);

        const holeRadiusMultiplier = 0.264 * 0.7; 
        const holeRadius = SCREENSHOT_TARGET_SIZE * holeRadiusMultiplier; 
        const holeCenterX = SCREENSHOT_TARGET_SIZE / 2;
        const holeCenterY = SCREENSHOT_TARGET_SIZE / 2;

        ctx.save();
        ctx.beginPath();
        ctx.arc(holeCenterX, holeCenterY, holeRadius, 0, Math.PI * 2, false);
        ctx.clip();
        ctx.drawImage(loadedWhiteImg, 0, 0, SCREENSHOT_TARGET_SIZE, SCREENSHOT_TARGET_SIZE); 
        ctx.restore(); 

        ctx.strokeStyle = '#181818'; 
        ctx.lineWidth = Math.max(2, Math.round(SCREENSHOT_TARGET_SIZE * 0.008)); 
        ctx.beginPath();
        ctx.arc(holeCenterX, holeCenterY, holeRadius, 0, Math.PI * 2, false);
        ctx.stroke();
        
        ctx.fillStyle = globalCityColor; 
        ctx.textBaseline = 'top'; 
        
        const scaleFactor = 1.2; 

        ctx.textAlign = 'center';
        const margin = Math.max(Math.round(15 * scaleFactor), Math.floor(SCREENSHOT_TARGET_SIZE / (75 / scaleFactor))); 
        const centerX = SCREENSHOT_TARGET_SIZE / 2;
        let currentY = margin;

        ctx.shadowColor = globalCityColor;
        ctx.shadowBlur = Math.max(Math.round(4 * scaleFactor), Math.floor(SCREENSHOT_TARGET_SIZE / (150 / scaleFactor))); 
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        const aeonlightsFontSize = Math.max(Math.round(16 * scaleFactor), Math.floor(SCREENSHOT_TARGET_SIZE * 0.018 * scaleFactor)); 
        ctx.font = `bold ${aeonlightsFontSize}px 'VT323', monospace`;
        const aeonlightsText = "Aeonlights";
        ctx.fillText(aeonlightsText.toUpperCase(), centerX, currentY);
        currentY += aeonlightsFontSize * 1.2;

        currentY += Math.max(Math.round(3 * scaleFactor), Math.floor(SCREENSHOT_TARGET_SIZE / (150 / scaleFactor))); 
        const lineWidth = SCREENSHOT_TARGET_SIZE * (0.12 * scaleFactor); 
        const baseLineHeight = Math.max(1, Math.floor(SCREENSHOT_TARGET_SIZE / 400));
        const lineHeight = Math.max(1, Math.round(baseLineHeight * scaleFactor));
        
        ctx.shadowColor = 'transparent'; 
        ctx.fillRect(centerX - lineWidth / 2, currentY, lineWidth, lineHeight);
        ctx.shadowColor = globalCityColor; 

        currentY += lineHeight;
        currentY += Math.max(Math.round(5 * scaleFactor), Math.floor(SCREENSHOT_TARGET_SIZE / (120 / scaleFactor))); 

        const futureCitiesFontSize = Math.max(Math.round(30 * scaleFactor), Math.floor(SCREENSHOT_TARGET_SIZE * 0.04 * scaleFactor)); 
        ctx.font = `bold ${futureCitiesFontSize}px 'VT323', monospace`;
        const futureCitiesText = "Future Cities";
        ctx.fillText(futureCitiesText.toUpperCase(), centerX, currentY);
        
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom'; 

        const overlayBaseFontSize = 10; 
        const overlayFontSize = Math.max(Math.round(overlayBaseFontSize * scaleFactor), Math.floor(SCREENSHOT_TARGET_SIZE * 0.012 * scaleFactor));
        ctx.font = `bold ${overlayFontSize}px 'VT323', monospace`;
        
        ctx.shadowBlur = Math.max(Math.round(1.5 * scaleFactor), Math.floor(SCREENSHOT_TARGET_SIZE / (400 / scaleFactor))); 

        const overlayMargin = Math.max(Math.round(10 * scaleFactor), Math.floor(SCREENSHOT_TARGET_SIZE * 0.015));
        let overlayBottomY = SCREENSHOT_TARGET_SIZE - overlayMargin;
        const textLineHeight = overlayFontSize * 1.2;

        const labelText = "LABEL: ELPIDA MUSIC";
        ctx.fillText(labelText.toUpperCase(), overlayMargin, overlayBottomY);
        overlayBottomY -= textLineHeight; 
        const releaseDateText = "RELEASE DATE: 20/6/2025";
        ctx.fillText(releaseDateText.toUpperCase(), overlayMargin, overlayBottomY);

        ctx.textAlign = 'right';
        
        let overlayBottomRightY = SCREENSHOT_TARGET_SIZE - overlayMargin;
        const overlayRightX = SCREENSHOT_TARGET_SIZE - overlayMargin;

        const codeByText = "CODE BY AEONLIGHTS";
        ctx.fillText(codeByText.toUpperCase(), overlayRightX, overlayBottomRightY);
        overlayBottomRightY -= textLineHeight;
        const lpCoverText = "YOUR VIRTUAL LP COVER";
        ctx.fillText(lpCoverText.toUpperCase(), overlayRightX, overlayBottomRightY);

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        const link = document.createElement('a');
        link.download = 'Future_Cities_LP_Cover.png'; 
        link.href = tempCanvas.toDataURL('image/png');
        document.body.appendChild(link); 
        link.click();
        document.body.removeChild(link);

    } catch (error) {
      console.error("Error processing screenshot images:", error);
    }

  }, [globalCityColor, onScreenshotInitiated, cityColorTHREE]);

  const handleMouseWheel = useCallback((event: WheelEvent) => {
    if (!cameraRef.current) return;
    event.preventDefault(); 

    const newFov = cameraFovRef.current + Math.sign(event.deltaY) * FOV_STEP;
    cameraFovRef.current = Math.max(MIN_FOV, Math.min(MAX_FOV, newFov));
  }, []);

  const updateNormalizedPointerX = useCallback((clientX: number) => {
    if (!mountRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    const pointerX = clientX - rect.left;
    normalizedMouseXRef.current = (pointerX / rect.width) * 2 - 1; // -1 to 1
  }, []);

  const mouseMoveHandler = useCallback((event: MouseEvent) => {
    updateNormalizedPointerX(event.clientX);
  }, [updateNormalizedPointerX]);

  const mouseLeaveHandler = useCallback(() => {
    normalizedMouseXRef.current = 0;
  }, []);

  const calculateTouchDistance = (touch1: Touch, touch2: Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const touchStartHandler = useCallback((event: TouchEvent) => {
    if (!mountRef.current) return;
    event.preventDefault();
    if (event.touches.length === 2) {
        initialPinchDistanceRef.current = calculateTouchDistance(event.touches[0], event.touches[1]);
        initialFovAtPinchStartRef.current = cameraFovRef.current;
        normalizedMouseXRef.current = 0; // Stop steering during pinch
    } else if (event.touches.length === 1) {
        initialPinchDistanceRef.current = null; // Clear pinch state if switching to 1 touch
        initialFovAtPinchStartRef.current = null;
        updateNormalizedPointerX(event.touches[0].clientX);
    }
  }, [updateNormalizedPointerX]);

  const touchMoveHandler = useCallback((event: TouchEvent) => {
    if (!mountRef.current) return;
    event.preventDefault();
    if (event.touches.length === 2 && initialPinchDistanceRef.current !== null && initialFovAtPinchStartRef.current !== null) {
        const currentDistance = calculateTouchDistance(event.touches[0], event.touches[1]);
        if (initialPinchDistanceRef.current === 0) return; // Avoid division by zero
        const scale = currentDistance / initialPinchDistanceRef.current;
        cameraFovRef.current = Math.max(MIN_FOV, Math.min(MAX_FOV, initialFovAtPinchStartRef.current * scale));
    } else if (event.touches.length === 1) {
      updateNormalizedPointerX(event.touches[0].clientX);
    }
  }, [updateNormalizedPointerX]);

  const touchEndHandler = useCallback((event: TouchEvent) => {
    normalizedMouseXRef.current = 0;
    if (event.touches.length < 2) {
      initialPinchDistanceRef.current = null;
      initialFovAtPinchStartRef.current = null;
    }
    if (event.touches.length === 1) {
      updateNormalizedPointerX(event.touches[0].clientX); 
    }
  }, [updateNormalizedPointerX]);


  useEffect(() => {
    if (!mountRef.current || typeof window === 'undefined') return;
    const currentMount = mountRef.current;

    sceneRef.current = new THREE.Scene();
    clockRef.current = new THREE.Clock();
    cameraRef.current = new THREE.PerspectiveCamera(cameraFovRef.current, currentMount.clientWidth / currentMount.clientHeight, 0.1, 2000);
    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); 
    
    rendererRef.current.setPixelRatio(window.devicePixelRatio);
    rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
    currentMount.appendChild(rendererRef.current.domElement);

    cameraRef.current.position.set(0, HIGH_ANGLE_INITIAL_CAMERA_Y, HIGH_ANGLE_INITIAL_CAMERA_Z);
    cameraAzimuthAngleRef.current = 0; 

    const skyGeometry = new THREE.PlaneGeometry(2, 2, 1, 1); 
    const skyMaterial = new THREE.ShaderMaterial({
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      uniforms: {
        topColor: { value: new THREE.Color(landscapeData?.sky.topColor || '#000022') },
        horizonColor: { value: new THREE.Color(landscapeData?.sky.horizonColor || '#000000') }
      },
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
      transparent: true, 
    });
    skyMeshRef.current = new THREE.Mesh(skyGeometry, skyMaterial);
    sceneRef.current.add(skyMeshRef.current); 

    cityElementsGroupRef.current = new THREE.Group();
    sceneRef.current.add(cityElementsGroupRef.current);
    
    // Moved initial building population to its own useEffect below

    const handleResize = () => {
      if (cameraRef.current && rendererRef.current && currentMount) {
        const newWidth = currentMount.clientWidth;
        const newHeight = Math.max(1, currentMount.clientHeight); 
        cameraRef.current.aspect = newWidth / newHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(newWidth, newHeight);
      }
    };
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        isRotatingLeftRef.current = true;
        event.preventDefault();
      } else if (event.key === 'ArrowRight') {
        isRotatingRightRef.current = true;
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        isRotatingLeftRef.current = false;
      } else if (event.key === 'ArrowRight') {
        isRotatingRightRef.current = false;
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    currentMount.addEventListener('wheel', handleMouseWheel, { passive: false });
    
    currentMount.addEventListener('mousemove', mouseMoveHandler);
    currentMount.addEventListener('mouseleave', mouseLeaveHandler);
    currentMount.addEventListener('touchstart', touchStartHandler, { passive: false });
    currentMount.addEventListener('touchmove', touchMoveHandler, { passive: false });
    currentMount.addEventListener('touchend', touchEndHandler);
    currentMount.addEventListener('touchcancel', touchEndHandler);


    handleResize(); 

    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !cityElementsGroupRef.current || !skyMeshRef.current || !clockRef.current) return;

      if (isCapturingRef.current) return; 
      
      const delta = clockRef.current.getDelta(); 
      const elapsedTimeTotal = clockRef.current.getElapsedTime();

      const cam = cameraRef.current;
      const group = cityElementsGroupRef.current;

      if (Math.abs(cam.fov - cameraFovRef.current) > 0.01) {
        cam.fov = cameraFovRef.current;
        cam.updateProjectionMatrix();
      }

      if (isRotatingLeftRef.current) {
        cameraAzimuthAngleRef.current -= KEYBOARD_ROTATION_SPEED;
      }
      if (isRotatingRightRef.current) {
        cameraAzimuthAngleRef.current += KEYBOARD_ROTATION_SPEED;
      }
      
      cameraAzimuthAngleRef.current += normalizedMouseXRef.current * MOUSE_AZIMUTH_SENSITIVITY_PER_FRAME;

      const forwardDirection = new THREE.Vector3(
        Math.sin(cameraAzimuthAngleRef.current),
        0, 
        -Math.cos(cameraAzimuthAngleRef.current)
      ).normalize();

      cam.position.addScaledVector(forwardDirection, HIGH_ANGLE_FORWARD_SPEED);

      const lookAtPosition = new THREE.Vector3();
      lookAtPosition.copy(cam.position).addScaledVector(forwardDirection, HIGH_ANGLE_LOOK_AHEAD_Z);
      lookAtPosition.y = HIGH_ANGLE_LOOK_AT_Y_TARGET; 
      cam.lookAt(lookAtPosition);
      
      const cameraPosition = cam.position;

      // Dynamic Cluster Generation Logic
      let triggerNewGeneration = false;
      const nextClusterPotentialCenter = cameraPosition.clone().addScaledVector(forwardDirection, CLUSTER_SPAWN_AHEAD_OFFSET);

      if (generationTriggerPointsRef.current.length === 0) {
          if (cameraPosition.lengthSq() > (GENERATION_TRIGGER_DISTANCE * 0.5) * (GENERATION_TRIGGER_DISTANCE * 0.5) ) {
              triggerNewGeneration = true;
          }
      } else {
          let farEnoughFromAllExisting = true;
          for (const existingPoint of generationTriggerPointsRef.current) {
              if (nextClusterPotentialCenter.distanceToSquared(existingPoint) < MIN_DISTANCE_BETWEEN_TRIGGER_POINTS * MIN_DISTANCE_BETWEEN_TRIGGER_POINTS) {
                  farEnoughFromAllExisting = false;
                  break;
              }
          }
          if (farEnoughFromAllExisting) {
              triggerNewGeneration = true;
          }
      }

      if (triggerNewGeneration && activeClusterRequestsRef.current < MAX_ACTIVE_CLUSTER_REQUESTS) {
          activeClusterRequestsRef.current++;
          const baseSpawnPointAhead = cameraPosition.clone().addScaledVector(forwardDirection, CLUSTER_SPAWN_AHEAD_OFFSET);
          generationTriggerPointsRef.current.push(baseSpawnPointAhead.clone());
          
          const rightDirection = new THREE.Vector3().crossVectors(forwardDirection, cam.up).normalize();
          const numClustersToGenerate = Math.floor(Math.random() * 5) + 1; // 1 to 5 clusters
          const clusterPromises: Promise<CityElementData[] | null>[] = [];
          const targetCenters: THREE.Vector3[] = [];

          for (let i = 0; i < numClustersToGenerate; i++) {
              const lateralOffset = (i - (numClustersToGenerate - 1) / 2) * INTER_CLUSTER_SPACING;
              const targetCenter = baseSpawnPointAhead.clone().add(rightDirection.clone().multiplyScalar(lateralOffset));
              targetCenters.push(targetCenter);
              
              const clusterIdPrefix = `dyn_c${nextClusterIdCounterRef.current++}_`;
              clusterPromises.push(generateBuildingCluster(clusterIdPrefix));
          }
          
          Promise.allSettled(clusterPromises)
          .then((results) => {
              results.forEach((result, index) => {
                  if (result.status === 'fulfilled' && result.value && cityElementsGroupRef.current) {
                      const newClusterBuildings = result.value;
                      const clusterTargetCenter = targetCenters[index];
                      newClusterBuildings.forEach(b_data => {
                          b_data.position.x += clusterTargetCenter.x;
                          b_data.position.z += clusterTargetCenter.z;
                          const buildingMesh = createOrUpdateLineSegments(b_data, undefined, true);
                          cityElementsGroupRef.current?.add(buildingMesh);
                          dynamicallyGeneratedBuildingsRef.current.add(b_data.id);
                      });
                  } else if (result.status === 'rejected') {
                      console.error(`Failed to generate cluster ${index + 1}:`, result.reason);
                  }
              });
          })
          .catch(err => console.error(`Error processing cluster generation batch:`, err))
          .finally(() => {
              activeClusterRequestsRef.current--;
          });
      }
      
      // Fade-in animation for dynamically generated buildings
      group.children.forEach(child => {
        const element = child as THREE.LineSegments;
        if (element.userData.isDynamicallyGenerated && element.userData.isAppearing) {
            const timeElapsed = elapsedTimeTotal - element.userData.creationTime;
            const newOpacity = Math.min(1, timeElapsed / FADE_IN_DURATION);
            (element.material as THREE.LineBasicMaterial).opacity = newOpacity;
            if (newOpacity >= 1) {
                element.userData.isAppearing = false;
            }
        }
      });


      if (landscapeData && skyMeshRef.current) {
        const material = skyMeshRef.current.material as THREE.ShaderMaterial;
        material.uniforms.topColor.value.set(landscapeData.sky.topColor);
        material.uniforms.horizonColor.value.set(landscapeData.sky.horizonColor);
      }
      
      skyMeshRef.current.position.copy(cam.position);
      skyMeshRef.current.rotation.copy(cam.rotation);
      skyMeshRef.current.translateZ(-1500); 
      skyMeshRef.current.updateMatrixWorld();

      rendererRef.current.render(sceneRef.current, cam);
    };

    animate();

    return () => {
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      currentMount.removeEventListener('wheel', handleMouseWheel);
      currentMount.removeEventListener('mousemove', mouseMoveHandler);
      currentMount.removeEventListener('mouseleave', mouseLeaveHandler);
      currentMount.removeEventListener('touchstart', touchStartHandler);
      currentMount.removeEventListener('touchmove', touchMoveHandler);
      currentMount.removeEventListener('touchend', touchEndHandler);
      currentMount.removeEventListener('touchcancel', touchEndHandler);

      if (rendererRef.current) {
         rendererRef.current.dispose();
         if(rendererRef.current.domElement.parentElement === currentMount) { 
            currentMount.removeChild(rendererRef.current.domElement);
         }
      }
      if (sceneRef.current) {
        sceneRef.current.traverse(object => {
          if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
            if (object.geometry) object.geometry.dispose();
            if (Array.isArray(object.material)) {
              object.material.forEach(material => material.dispose());
            } else if (object.material) {
              (object.material as THREE.Material).dispose();
            }
          }
        });
      }
      cityElementsGroupRef.current = null;
      skyMeshRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      clockRef.current = null;
    };
  // eslint-disable-next-line react-hooks/ exhaustive-deps
  }, [globalCityColor, createOrUpdateLineSegments, generateBuildingCluster, handleMouseWheel, mouseMoveHandler, mouseLeaveHandler, touchStartHandler, touchMoveHandler, touchEndHandler]); 
  // Removed landscapeData from main setup deps, moved its handling to dedicated effect below

  // Effect for handling initial landscapeData and subsequent changes (global GENERATE)
  useEffect(() => {
    if (!cityElementsGroupRef.current || !sceneRef.current) return;
    const group = cityElementsGroupRef.current;

    // 1. Clear all dynamically generated buildings if any exist
    if (dynamicallyGeneratedBuildingsRef.current.size > 0) {
        group.children.slice().forEach(child => {
            if (dynamicallyGeneratedBuildingsRef.current.has(child.userData.id)) {
                const childTyped = child as THREE.Object3D & { geometry?: THREE.BufferGeometry, material?: THREE.Material | THREE.Material[] };
                if (childTyped.geometry) childTyped.geometry.dispose();
                if (childTyped.material) {
                    if (Array.isArray(childTyped.material)) childTyped.material.forEach(m => m.dispose());
                    else (childTyped.material as THREE.Material).dispose();
                }
                group.remove(child);
            }
        });
        dynamicallyGeneratedBuildingsRef.current.clear();
        generationTriggerPointsRef.current = [];
        activeClusterRequestsRef.current = 0;
        nextClusterIdCounterRef.current = 0;
    }
    
    // 2. Process the new landscapeData (initial buildings)
    if (!landscapeData?.buildings || landscapeData.buildings.length === 0) {
        // If new landscapeData is empty, clear remaining initial buildings
        group.children.slice().forEach(child => { // Ensure we only remove what's left (initials)
             const childTyped = child as THREE.Object3D & { geometry?: THREE.BufferGeometry, material?: THREE.Material | THREE.Material[] };
             if (childTyped.geometry) childTyped.geometry.dispose();
             if (childTyped.material) {
                 if (Array.isArray(childTyped.material)) childTyped.material.forEach(m => m.dispose());
                 else (childTyped.material as THREE.Material).dispose();
             }
             group.remove(child);
        });
        return;
    }
    
    const newInitialElementIds = new Set(landscapeData.buildings.map(b => b.id));

    // Update or add initial buildings
    landscapeData.buildings.forEach(b_data => {
      // We only care about buildings not in dynamic set, as dynamic ones are cleared
      if (dynamicallyGeneratedBuildingsRef.current.has(b_data.id)) return; 

      let element = group.children.find(c => c.userData.id === b_data.id) as THREE.LineSegments | undefined;
      if (element) { 
        (element.material as THREE.LineBasicMaterial).color.copy(cityColorTHREE); 
        createOrUpdateLineSegments(b_data, element, false); // false: not dynamic fade-in
        element.position.set(b_data.position.x, b_data.position.y + (b_data.dimensions.height || 0) / 2, b_data.position.z);
         if (b_data.orientationY !== undefined) {
            element.rotation.y = b_data.orientationY;
        }
        element.userData.height = b_data.dimensions.height || 0;
        element.userData.isDynamicallyGenerated = false; // Ensure it's marked as initial
        element.userData.isAppearing = false;

      } else { 
        element = createOrUpdateLineSegments(b_data, undefined, false); // false: not dynamic fade-in
        group.add(element);
      }
    });

    // Remove old initial buildings that are not in the new landscapeData
    group.children.slice().forEach(child => { 
      if (!child.userData.isDynamicallyGenerated && !newInitialElementIds.has(child.userData.id)) {
        const childTyped = child as THREE.Object3D & { geometry?: THREE.BufferGeometry, material?: THREE.Material | THREE.Material[] };
        if (childTyped.geometry) childTyped.geometry.dispose();
        if (childTyped.material) {
           if (Array.isArray(childTyped.material)) {
                childTyped.material.forEach(m => m.dispose());
            } else {
                (childTyped.material as THREE.Material).dispose();
            }
        }
        group.remove(child);
      }
    });

  }, [landscapeData, createOrUpdateLineSegments, cityColorTHREE]); // Depend on landscapeData directly


  return (
    <div
      ref={mountRef}
      className="w-full h-full cursor-pointer relative" 
      onClick={handleCanvasClickAndCapture}
      onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCanvasClickAndCapture(); }}
      role="application" 
      aria-label="3D Cityscape View. Click or press Enter/Space to capture screenshot. Use left/right arrow keys to rotate view. Use mouse wheel to zoom in/out. On touch devices, swipe to steer and pinch to zoom."
      tabIndex={0} 
      style={{ outline: 'none', cursor: 'none' }} 
    />
  );
};

export default forwardRef(ThreeCityscape);