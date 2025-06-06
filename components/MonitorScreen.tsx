import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { LandscapeData, CityElementData } from '../App';
import ThreeCityscape, { ThreeCityscapeHandle } from './ThreeCityscape';
import LogoSpinner from './LogoSpinner'; // Import the new LogoSpinner component
import RotatingWireframeMap from './RotatingWireframeMap'; // Import the new map component

interface C64GreenStyle {
  color: string;
  textShadow: string;
}
interface MonitorScreenProps {
  landscapeData: LandscapeData | null;
  isLoading: boolean;
  error: string | null;
  onGenerateClick: () => void;
  isGenerating: boolean;
  canGenerate: boolean;
  c64GreenStyle: C64GreenStyle;
  generateBuildingCluster: (clusterIdPrefix: string) => Promise<CityElementData[] | null>;
}

const CameraIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
    <circle cx="12" cy="13" r="4"></circle>
  </svg>
);

// Helper function to convert hex to RGB
const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 128, b: 0 }; // Default to a failsafe green
};

// Helper function to generate noise texture
const generateNoiseTexture = (color: string, width: number, height: number): string => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  const mainColorRGB = hexToRgb(color);
  // Darker green for contrast, ensuring green channel is dominant
  const darkColorRGB = { r: Math.floor(mainColorRGB.r * 0.2), g: Math.floor(mainColorRGB.g * 0.4), b: Math.floor(mainColorRGB.b * 0.2) };


  for (let i = 0; i < data.length; i += 4) {
    const randomChoice = Math.random();
    if (randomChoice < 0.6) { // 60% chance for main green
      data[i] = mainColorRGB.r;
      data[i + 1] = mainColorRGB.g;
      data[i + 2] = mainColorRGB.b;
    } else if (randomChoice < 0.85) { // 25% chance for darker green
        data[i] = darkColorRGB.r;
        data[i+1] = darkColorRGB.g;
        data[i+2] = darkColorRGB.b;
    } else { // 15% chance for black
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
    data[i + 3] = 255; // Alpha
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
};

const characteristicOptions = [
  "White skin", "Blue eyes", "Medium height", "Doctor", "Scientist",
  "Teacher", "Student", "Brown hair", "Green eyes", "Tall build",
  "Engineer", "Artist", "Musician", "Short build", "Hazel eyes",
  "Dark skin", "Black hair", "Athlete", "Writer", "Pilot",
  "Red hair", "Gray eyes", "Average build", "Explorer", "Chef",
  "Cyberneticist", "Bio-engineer", "Urban planner", "Synth-weaver", "Data broker",
  "Neuro-divergent", "Enhanced reflexes", "Telepathic node", "Chrono-agent", "Void navigator"
];

const researchCharacteristicOptions = [
  "Medicine", "Astrophysics", "Quantum Entanglement", "AI Ethics", "Genetic Sequencing", 
  "Neural Networks", "Fusion Power", "Exoplanet Colonization", "Cybernetic Law", 
  "Dark Matter Studies", "Bio-Synthetic Materials", "Nanotechnology Applications", 
  "Virtual Reality History", "Deep Sea Exploration", "Robotics & Automation", 
  "Climate Science", "Advanced Propulsion Systems", "Terraforming Techniques",
  "Interstellar Communication", "Zero-Point Energy"
];

const validationCharacteristicOptions = [
  "Architectural Designs", "City Layout Grid", "Road Network Integrity", "Traffic Flow Simulation", 
  "Power Grid Distribution", "Water Reclamation Systems", "Food Synthesis Plants", "Air Quality Control", 
  "Emergency Response Protocols", "Drone Traffic Management", "Structural Integrity Scans", 
  "Communication Networks", "Waste Disposal Efficiency", "Public Transport Routes", 
  "Building Code Compliance", "Data Security Audits", "Resource Allocation Models", 
  "Automated Supply Chains", "Environmental Impact Assays", "Citizen Well-being Metrics"
];

const consoleLoadingSequence = [
  "INITIATING SYSCHECK V2.3...",
  "MEMORY MODULES... OK",
  "CORE PROCESSOR... ONLINE",
  "GRAPHICS SUBSYSTEM VRAM... VERIFIED",
  "AUDIO RENDERER DSP... INITIALIZED",
  "NEURAL NETLINK INTERFACE... ACTIVE",
  "GEO-DATA NODES... CONNECTING",
  "ESTABLISHING QUANTUM UPLINK...",
  "ACCESSING SECTOR DATABASE (GRID 7)...",
  "COMPILING URBAN MATRIX V9.1.4...",
  "DECOMPRESSING TEXTURE CACHE (HI-RES)...",
  "LOADING PROCEDURAL ALGORITHMS...",
  "PRE-RENDERING INITIAL VIEWPORT...",
  "CALIBRATING SIMULATION CORE (PRECISION MODE)...",
  "SYNCHRONIZING CHRONOMETERS (ATOMIC CLOCK)...",
  "VIRTUAL ENVIRONMENT STABILIZED.",
  "AWAITING USER COMMANDS...",
  "SYSTEM READY."
];

const futuristicCityNames = ["Neo-Kyoto", "Aethelburg Prime", "Cygnus X-1 Hub", "Nova Alexandria", "Titan Spire", "Arcadia VII", "Helios City", "Xylos Megaplex", "Seraphim Station", "Hadley's Hope 2.0", "Solara Outpost", "Veridia Complex", "Centauri Citadel", "Orion Belt Port", "Nebula Core"];

type ActiveFlashType = 'generic' | 'populate' | 'research' | 'validate' | 'xAxisA' | 'yAxisB' | 'viewMap' | null;


const MonitorScreen: React.FC<MonitorScreenProps> = ({
  landscapeData,
  isLoading,
  error,
  onGenerateClick,
  isGenerating,
  canGenerate,
  c64GreenStyle,
  generateBuildingCluster,
}) => {
  const baseButtonDisabled = isGenerating || !canGenerate;
  const threeCityscapeRef = useRef<ThreeCityscapeHandle>(null);

  const [showScreenshotNotification, setShowScreenshotNotification] = useState(false);
  const notificationTimeoutRef = useRef<number | null>(null);
  
  const [isFlashing, setIsFlashing] = useState(false);
  const [activeFlashType, setActiveFlashType] = useState<ActiveFlashType>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  
  const [isStaticFlashingFullScreen, setIsStaticFlashingFullScreen] = useState(false);
  const staticFlashFullScreenTimeoutRef = useRef<number | null>(null);

  const [noiseDataURL, setNoiseDataURL] = useState<string | null>(null);
  const animationFrameIdNoiseRef = useRef<number | null>(null);
  const [pressedButton, setPressedButton] = useState<string | null>(null);

  const [loaderProgress, setLoaderProgress] = useState(0); 
  const animateLoaderRef = useRef<number | null>(null);
  const loaderStartTimeRef = useRef<number | null>(null);

  const targetPopulationNumberRef = useRef<number>(0); // Reused for target count
  const [currentPopulationDisplay, setCurrentPopulationDisplay] = useState<string>('0'); // Reused
  const [currentCharacteristicText, setCurrentCharacteristicText] = useState<string>('');
  const characteristicIntervalRef = useRef<number | null>(null);

  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [currentConsoleLineIndex, setCurrentConsoleLineIndex] = useState(0);
  const consoleIntervalRef = useRef<number | null>(null);

  // State for "CITY TERRAIN" window text animation
  const [typedMapCityNamePart, setTypedMapCityNamePart] = useState("");
  const [showMapCityCursor, setShowMapCityCursor] = useState(false);
  const mapCityTypingIntervalRef = useRef<number | null>(null);


  const buttonTextShadow = c64GreenStyle.textShadow;

  const infoTextStyle = {
    color: c64GreenStyle.color,
    textShadow: c64GreenStyle.textShadow,
  };

  const c64GreenBracketStyle = {
    ...infoTextStyle,
  };

  const blackTextStyle = {
    color: '#000000',
    textShadow: 'none',
  };

  const getBaseButtonStyle = (isDisabled: boolean): React.CSSProperties => {
    const style: React.CSSProperties = {
      color: c64GreenStyle.color, 
      textShadow: buttonTextShadow,
    };
    if (isDisabled && !isGenerating) { 
      style.textShadow = 'none';
      style.color = '#166534'; 
    }
    return style;
  };

  useEffect(() => {
    const texture = generateNoiseTexture(c64GreenStyle.color, 64, 64);
    setNoiseDataURL(texture);
  }, [c64GreenStyle.color]);

  const animateNoise = useCallback(() => {
    if (!isFlashing && !isStaticFlashingFullScreen) return; 
    const newTexture = generateNoiseTexture(c64GreenStyle.color, 64, 64);
    setNoiseDataURL(newTexture);
    animationFrameIdNoiseRef.current = requestAnimationFrame(animateNoise);
  }, [isFlashing, isStaticFlashingFullScreen, c64GreenStyle.color]);

  useEffect(() => {
    if (isFlashing || isStaticFlashingFullScreen) {
      animationFrameIdNoiseRef.current = requestAnimationFrame(animateNoise);
    } else {
      if (animationFrameIdNoiseRef.current) {
        cancelAnimationFrame(animationFrameIdNoiseRef.current);
        animationFrameIdNoiseRef.current = null;
      }
    }
    return () => {
      if (animationFrameIdNoiseRef.current) {
        cancelAnimationFrame(animationFrameIdNoiseRef.current);
      }
    };
  }, [isFlashing, isStaticFlashingFullScreen, animateNoise]);

  useEffect(() => {
    if (isLoading) {
      setCurrentConsoleLineIndex(0);
      setConsoleLines([]);
      if (consoleIntervalRef.current) clearInterval(consoleIntervalRef.current);

      consoleIntervalRef.current = window.setInterval(() => {
        setCurrentConsoleLineIndex(prevIndex => {
          if (prevIndex < consoleLoadingSequence.length) {
            setConsoleLines(prevLines => [...prevLines, consoleLoadingSequence[prevIndex]]);
            return prevIndex + 1;
          } else {
            if (consoleIntervalRef.current) clearInterval(consoleIntervalRef.current);
            // Cursor will continue to blink at the end of the last line while isLoading is true
            return prevIndex; 
          }
        });
      }, 350);
    } else {
      if (consoleIntervalRef.current) clearInterval(consoleIntervalRef.current);
      // Optionally clear lines when not loading, or keep them:
      // setConsoleLines([]); 
    }
    return () => {
      if (consoleIntervalRef.current) clearInterval(consoleIntervalRef.current);
    };
  }, [isLoading]);

  // Cleanup for City Terrain text animation intervals
  useEffect(() => {
    return () => {
        if (mapCityTypingIntervalRef.current) clearInterval(mapCityTypingIntervalRef.current);
    };
  }, []);

  // Logic for City Terrain text animation
  const startMapCityNameAnimation = useCallback(() => {
    if (mapCityTypingIntervalRef.current) clearInterval(mapCityTypingIntervalRef.current);
    setTypedMapCityNamePart("");
    setShowMapCityCursor(true);

    const currentCityName = futuristicCityNames.length > 0 ? futuristicCityNames[0] : "CITY-DATA-ERROR";
    let charIndex = 0;

    mapCityTypingIntervalRef.current = window.setInterval(() => {
        if (charIndex < currentCityName.length) {
            setTypedMapCityNamePart(prev => prev + currentCityName.charAt(charIndex));
            charIndex++;
        } else {
            if (mapCityTypingIntervalRef.current) clearInterval(mapCityTypingIntervalRef.current);
        }
    }, 120); 
  }, []); 

  useEffect(() => {
    if (isFlashing && activeFlashType === 'viewMap') {
        startMapCityNameAnimation();
    } else {
        if (mapCityTypingIntervalRef.current) clearInterval(mapCityTypingIntervalRef.current);
        setTypedMapCityNamePart("");
        setShowMapCityCursor(false);
    }
  }, [isFlashing, activeFlashType, startMapCityNameAnimation]);


  const triggerFlash = (type: ActiveFlashType = 'generic', durationMs: number = 100) => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    if (animateLoaderRef.current) cancelAnimationFrame(animateLoaderRef.current);
    if (characteristicIntervalRef.current) clearInterval(characteristicIntervalRef.current);
    if (staticFlashFullScreenTimeoutRef.current) clearTimeout(staticFlashFullScreenTimeoutRef.current);
    
    if (mapCityTypingIntervalRef.current) clearInterval(mapCityTypingIntervalRef.current);
  
    setIsFlashing(false); 
    setActiveFlashType(null);
    setLoaderProgress(0); 
    setCurrentPopulationDisplay('0');
    setCurrentCharacteristicText('');
    loaderStartTimeRef.current = null;
    setTypedMapCityNamePart("");
    setShowMapCityCursor(false);
  
    const typesWithFullScreenStaticFirst: ActiveFlashType[] = ['populate', 'research', 'validate', 'xAxisA', 'yAxisB', 'viewMap'];
  
    if (type && typesWithFullScreenStaticFirst.includes(type)) {
        setIsStaticFlashingFullScreen(true); 
        
        let fullScreenStaticDuration = 100;
        if (type === 'xAxisA' || type === 'yAxisB') {
          fullScreenStaticDuration = 50;
        }
  
        staticFlashFullScreenTimeoutRef.current = window.setTimeout(() => {
            setIsStaticFlashingFullScreen(false); 
            setIsFlashing(true);
  
            if (type === 'populate' || type === 'research' || type === 'validate') {
                setActiveFlashType(type);
                let currentOptions: string[];
                switch(type) {
                    case 'populate':
                        currentOptions = characteristicOptions;
                        targetPopulationNumberRef.current = Math.floor(Math.random() * 9000000) + 1000000;
                        break;
                    case 'research':
                        currentOptions = researchCharacteristicOptions;
                        targetPopulationNumberRef.current = Math.floor(Math.random() * 950000) + 50000;
                        break;
                    case 'validate':
                        currentOptions = validationCharacteristicOptions;
                        targetPopulationNumberRef.current = Math.floor(Math.random() * 430000) + 20000;
                        break;
                    default: 
                        currentOptions = [];
                        targetPopulationNumberRef.current = 0;
                }
                
                loaderStartTimeRef.current = performance.now();
                const initialCharacteristic = currentOptions[Math.floor(Math.random() * currentOptions.length)];
                setCurrentCharacteristicText(initialCharacteristic);
  
                characteristicIntervalRef.current = window.setInterval(() => {
                    const nextCharacteristic = currentOptions[Math.floor(Math.random() * currentOptions.length)];
                    setCurrentCharacteristicText(nextCharacteristic);
                }, 375);
  
                const updateLoaderAnimation = (currentTime: number) => {
                    if (!loaderStartTimeRef.current) return; 
                    const elapsedTime = currentTime - loaderStartTimeRef.current;
                    const progress = Math.min(100, (elapsedTime / durationMs) * 100);
                    setLoaderProgress(progress);
                    const currentCount = Math.floor((progress / 100) * targetPopulationNumberRef.current);
                    setCurrentPopulationDisplay(currentCount.toLocaleString());
                    if (progress < 100) {
                        animateLoaderRef.current = requestAnimationFrame(updateLoaderAnimation);
                    } else {
                         loaderStartTimeRef.current = null; 
                    }
                };
                animateLoaderRef.current = requestAnimationFrame(updateLoaderAnimation);
  
                flashTimeoutRef.current = window.setTimeout(() => {
                    setIsFlashing(false);
                    setActiveFlashType(null);
                    setLoaderProgress(0);
                    setCurrentPopulationDisplay('0');
                    setCurrentCharacteristicText('');
                    if (animateLoaderRef.current) cancelAnimationFrame(animateLoaderRef.current);
                    if (characteristicIntervalRef.current) clearInterval(characteristicIntervalRef.current);
                    loaderStartTimeRef.current = null;
                }, durationMs);
            } else if (type === 'xAxisA' || type === 'yAxisB') {
                setActiveFlashType('generic'); 
                flashTimeoutRef.current = window.setTimeout(() => {
                    setIsFlashing(false);
                    setActiveFlashType(null);
                }, 50); 
            } else if (type === 'viewMap') {
                setActiveFlashType(type);
                flashTimeoutRef.current = window.setTimeout(() => {
                    setIsFlashing(false);
                    setActiveFlashType(null);
                    if (mapCityTypingIntervalRef.current) clearInterval(mapCityTypingIntervalRef.current);
                    setTypedMapCityNamePart("");
                    setShowMapCityCursor(false);
                }, durationMs); 
            }
        }, fullScreenStaticDuration); 
  
    } else if (type === 'generic') {
        setIsFlashing(true);
        setActiveFlashType(type);
        flashTimeoutRef.current = window.setTimeout(() => {
            setIsFlashing(false);
            setActiveFlashType(null);
        }, durationMs); 
    }
  };
  
  const handleScreenshotInitiated = () => {
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    setShowScreenshotNotification(true);

    notificationTimeoutRef.current = window.setTimeout(() => {
      setShowScreenshotNotification(false);
    }, 1000);
  };

  const handleGenericButtonPress = (
    buttonId: string, 
    action: () => void, 
    flashType?: ActiveFlashType, 
    flashDurationMs?: number
  ) => {
    if (buttonId === 'generate' && isGenerating) {
      triggerFlash('generic', 100); 
      return; 
    }
  
    if (buttonId === 'zoomLvl') {
        if (!baseButtonDisabled) { 
            action(); 
        }
        return; 
    }
  
    if (baseButtonDisabled) return; 
    
    let resolvedFlashType = flashType !== undefined ? flashType : 'generic';
    
    let duration = flashDurationMs;
    if (resolvedFlashType === 'xAxisA' || resolvedFlashType === 'yAxisB') {
        triggerFlash(resolvedFlashType); // These types manage their own multi-stage durations
    } else if (resolvedFlashType) { 
        if (!duration) {
            switch(resolvedFlashType) {
                case 'populate': duration = 5000; break;
                case 'research': duration = 7000; break;
                case 'validate': duration = 6000; break;
                case 'viewMap': duration = 15000; break; // Longer duration for map
                default: duration = 100; 
            }
        }
        triggerFlash(resolvedFlashType, duration);
    }
    
    action(); 
  };
  
  const handleButtonMouseDown = (buttonId: string) => {
    if (buttonId === 'generate' && isGenerating) {
        setPressedButton(buttonId);
        return;
    }
    if (buttonId !== 'zoomLvl' && baseButtonDisabled) return;

    setPressedButton(buttonId);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setPressedButton(null);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      if (staticFlashFullScreenTimeoutRef.current) clearTimeout(staticFlashFullScreenTimeoutRef.current);
      if (animationFrameIdNoiseRef.current) cancelAnimationFrame(animationFrameIdNoiseRef.current);
      if (animateLoaderRef.current) cancelAnimationFrame(animateLoaderRef.current);
      if (characteristicIntervalRef.current) clearInterval(characteristicIntervalRef.current);
      if (consoleIntervalRef.current) clearInterval(consoleIntervalRef.current);
      if (mapCityTypingIntervalRef.current) clearInterval(mapCityTypingIntervalRef.current);
    };
  }, []);

  const populateLoaderBarHeightClasses = "h-5 sm:h-6 md:h-7 lg:h-8 xl:h-9 2xl:h-10";
  const blockChars = '█'.repeat(100); 


  const generateButtonHtmlDisabled = !canGenerate && !isGenerating;

  return (
    <div className="w-full h-full relative flex flex-col">
      <div className="flex-grow w-full h-full bg-black relative flex flex-col items-center justify-center overflow-hidden">

        <div
          className="absolute top-2 left-2 sm:top-3 sm:left-3 text-[9px] sm:text-[10px] md:text-[11px] opacity-85 leading-tight z-20 font-['VT323']"
          style={infoTextStyle}
        >
          <p>CITYNET OS v9.1 ONLINE</p>
          <p>SYSTEM: GEMINI URBAN CORE</p>
          <p>STATUS: <span className={isLoading ? "animate-pulse" : ""} style={infoTextStyle}>{isLoading ? "RENDERING SECTORS..." : (error ? "SYSTEM FAULT" : "CITY STABLE")}</span></p>
          <p>VIEW: <span style={infoTextStyle}>METROPLEX DRIVE</span></p>
        </div>

        {isLoading && (
            <div 
                className="absolute top-2 right-2 sm:top-3 sm:right-3 text-right z-20 font-['VT323']"
                style={{...infoTextStyle}}
            >
                <div 
                    className="text-[9px] sm:text-[10px] md:text-[11px] leading-tight opacity-90 mt-1 sm:mt-1.5"
                    style={infoTextStyle}
                >
                    {isLoading && consoleLines.length === 0 && currentConsoleLineIndex === 0 && (
                        <p className="text-right">
                            <span className="blinking-bracket" style={infoTextStyle}>█</span>
                        </p>
                    )}
                    {consoleLines.map((line, index) => (
                        <p key={index} className="text-right">
                            {line}
                            {isLoading && index === consoleLines.length - 1 && (
                                <span className="blinking-bracket" style={infoTextStyle}>&nbsp;█</span>
                            )}
                        </p>
                    ))}
                </div>
            </div>
        )}

        {!isLoading && (
          <div 
            className="absolute top-[6vh] right-[1vw] sm:right-[2vw] md:right-[3vw] lg:right-[4vw] xl:right-[5%] z-20 flex flex-col max-h-[88vh] w-[136px] sm:w-[168px] md:w-[212px] lg:w-[252px] xl:w-[328px] 2xl:w-[472px] border-2 border-black rounded-lg"
            style={{ 
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              boxShadow: `0 0 3px ${c64GreenStyle.color}, 0 0 6px ${c64GreenStyle.color}, 0 0 9px ${c64GreenStyle.color}`
            }}
          >
            <div 
              className="h-6 sm:h-7 md:h-8 bg-black flex items-center justify-center shrink-0 px-2"
              style={{ color: c64GreenStyle.color, textShadow: c64GreenStyle.textShadow }}
            >
              <span className="font-['VT323'] text-xs sm:text-sm md:text-base lg:text-lg uppercase truncate">
                // SYSTEM MENU //
              </span>
            </div>
            <div className="flex-grow flex flex-col items-center space-y-0 sm:space-y-px md:space-y-0.5 lg:space-y-0.5 xl:space-y-1 2xl:space-y-1 overflow-y-auto px-0.5 py-1 sm:px-1 sm:py-1.5 md:px-1.5 md:py-2 scrollbar-thin scrollbar-thumb-black/60 scrollbar-track-transparent">
              <button
                onClick={() => handleGenericButtonPress('generate', onGenerateClick)}
                onMouseDown={() => handleButtonMouseDown('generate')}
                disabled={generateButtonHtmlDisabled}
                aria-disabled={generateButtonHtmlDisabled}
                aria-label={isGenerating ? "Generating city..." : "Generate new city"}
                className={`
                  text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl
                  font-['VT323'] uppercase tracking-wider font-bold
                  transition-all duration-150 ease-in-out
                  focus:outline-none
                  p-1 sm:p-1.5 md:p-2 lg:p-2.5 xl:p-3 2xl:p-3
                  whitespace-nowrap
                  ${generateButtonHtmlDisabled ? 'opacity-50' : 'cursor-pointer'}
                `}
                style={getBaseButtonStyle(baseButtonDisabled)}
              >
                <span 
                  style={c64GreenBracketStyle} 
                  className={(pressedButton === 'generate' || isGenerating) ? "blinking-bracket" : ""}
                >
                  [
                </span>
                <span className={(canGenerate || isGenerating) ? 'hover:text-white active:text-neutral-300' : ''}>
                  GENERATE
                </span>
                <span 
                  style={c64GreenBracketStyle}
                  className={(pressedButton === 'generate' || isGenerating) ? "blinking-bracket" : ""}
                >
                  ]
                </span>
              </button>
              <button
                onClick={() => handleGenericButtonPress('populate', () => console.log("Populate button clicked - initiating census."), 'populate', 5000)}
                onMouseDown={() => handleButtonMouseDown('populate')}
                disabled={baseButtonDisabled}
                aria-disabled={baseButtonDisabled}
                aria-label="Populate city"
                className={`
                  text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl
                  font-['VT323'] uppercase tracking-wider font-bold
                  transition-all duration-150 ease-in-out
                  focus:outline-none
                  p-1 sm:p-1.5 md:p-2 lg:p-2.5 xl:p-3 2xl:p-3
                  whitespace-nowrap
                  ${baseButtonDisabled ? 'opacity-50' : 'cursor-pointer'}
                `}
                style={getBaseButtonStyle(baseButtonDisabled)}
              >
                <span style={c64GreenBracketStyle} className={(pressedButton === 'populate' || (isFlashing && activeFlashType === 'populate')) ? "blinking-bracket" : ""}>[</span>
                <span className={!baseButtonDisabled ? 'hover:text-white active:text-neutral-300' : ''}>
                  POPULATE
                </span>
                <span style={c64GreenBracketStyle} className={(pressedButton === 'populate' || (isFlashing && activeFlashType === 'populate')) ? "blinking-bracket" : ""}>]</span>
              </button>
              <button
                onClick={() => handleGenericButtonPress('research', () => console.log("Research data analysis initiated."), 'research', 7000)}
                onMouseDown={() => handleButtonMouseDown('research')}
                disabled={baseButtonDisabled}
                aria-disabled={baseButtonDisabled}
                aria-label="Research city topics"
                className={`
                  text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl
                  font-['VT323'] uppercase tracking-wider font-bold
                  transition-all duration-150 ease-in-out
                  focus:outline-none
                  p-1 sm:p-1.5 md:p-2 lg:p-2.5 xl:p-3 2xl:p-3
                  whitespace-nowrap
                  ${baseButtonDisabled ? 'opacity-50' : 'cursor-pointer'}
                `}
                style={getBaseButtonStyle(baseButtonDisabled)}
              >
                <span style={c64GreenBracketStyle} className={(pressedButton === 'research' || (isFlashing && activeFlashType === 'research')) ? "blinking-bracket" : ""}>[</span>
                <span className={!baseButtonDisabled ? 'hover:text-white active:text-neutral-300' : ''}>
                  RESEARCH
                </span>
                <span style={c64GreenBracketStyle} className={(pressedButton === 'research' || (isFlashing && activeFlashType === 'research')) ? "blinking-bracket" : ""}>]</span>
              </button>
              <button
                onClick={() => handleGenericButtonPress('validate', () => console.log("Validate button clicked - system checks initiated."), 'validate', 6000)}
                onMouseDown={() => handleButtonMouseDown('validate')}
                disabled={baseButtonDisabled}
                aria-disabled={baseButtonDisabled}
                aria-label="Validate city data"
                className={`
                  text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl
                  font-['VT323'] uppercase tracking-wider font-bold
                  transition-all duration-150 ease-in-out
                  focus:outline-none
                  p-1 sm:p-1.5 md:p-2 lg:p-2.5 xl:p-3 2xl:p-3
                  whitespace-nowrap
                  ${baseButtonDisabled ? 'opacity-50' : 'cursor-pointer'}
                `}
                style={getBaseButtonStyle(baseButtonDisabled)}
              >
                <span style={c64GreenBracketStyle} className={(pressedButton === 'validate' || (isFlashing && activeFlashType === 'validate')) ? "blinking-bracket" : ""}>[</span>
                <span className={!baseButtonDisabled ? 'hover:text-white active:text-neutral-300' : ''}>
                  VALIDATE
                </span>
                <span style={c64GreenBracketStyle} className={(pressedButton === 'validate' || (isFlashing && activeFlashType === 'validate')) ? "blinking-bracket" : ""}>]</span>
              </button>
              <button
                onClick={() => handleGenericButtonPress('viewMap', () => console.log("View Map button clicked."), 'viewMap', 15000)}
                onMouseDown={() => handleButtonMouseDown('viewMap')}
                disabled={baseButtonDisabled}
                aria-disabled={baseButtonDisabled}
                aria-label="View map"
                className={`
                  text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl
                  font-['VT323'] uppercase tracking-wider font-bold
                  transition-all duration-150 ease-in-out
                  focus:outline-none
                  p-1 sm:p-1.5 md:p-2 lg:p-2.5 xl:p-3 2xl:p-3
                  whitespace-nowrap
                  ${baseButtonDisabled ? 'opacity-50' : 'cursor-pointer'}
                `}
                style={getBaseButtonStyle(baseButtonDisabled)}
              >
                <span style={c64GreenBracketStyle} className={(pressedButton === 'viewMap' || (isFlashing && activeFlashType === 'viewMap')) ? "blinking-bracket" : ""}>[</span>
                <span className={!baseButtonDisabled ? 'hover:text-white active:text-neutral-300' : ''}>
                  VIEW MAP
                </span>
                <span style={c64GreenBracketStyle} className={(pressedButton === 'viewMap' || (isFlashing && activeFlashType === 'viewMap')) ? "blinking-bracket" : ""}>]</span>
              </button>
              <div className="h-2 sm:h-3 md:h-4 lg:h-5 xl:h-6 2xl:h-7"></div>
              <button
                onClick={() => handleGenericButtonPress(
                  'xAxisA', 
                  () => {
                    threeCityscapeRef.current?.turnViewDirection('left');
                    console.log("X-Axis A button clicked: Turned left.");
                  },
                  'xAxisA'
                )}
                onMouseDown={() => handleButtonMouseDown('xAxisA')}
                disabled={baseButtonDisabled}
                aria-disabled={baseButtonDisabled}
                aria-label="X-Axis A action - Turn Left"
                className={`
                  text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl
                  font-['VT323'] uppercase tracking-wider font-bold
                  transition-all duration-150 ease-in-out
                  focus:outline-none
                  p-1 sm:p-1.5 md:p-2 lg:p-2.5 xl:p-3 2xl:p-3
                  whitespace-nowrap
                  ${baseButtonDisabled ? 'opacity-50' : 'cursor-pointer'}
                `}
                style={getBaseButtonStyle(baseButtonDisabled)}
              >
                <span style={c64GreenBracketStyle} className={pressedButton === 'xAxisA' ? "blinking-bracket" : ""}>[</span>
                <span className={!baseButtonDisabled ? 'hover:text-white active:text-neutral-300' : ''}>
                  X-AXIS A
                </span>
                <span style={c64GreenBracketStyle} className={pressedButton === 'xAxisA' ? "blinking-bracket" : ""}>]</span>
              </button>
              <button
                onClick={() => handleGenericButtonPress(
                  'yAxisB', 
                  () => {
                    threeCityscapeRef.current?.turnViewDirection('right');
                    console.log("Y-Axis B button clicked: Turned right.");
                  },
                  'yAxisB'
                )}
                onMouseDown={() => handleButtonMouseDown('yAxisB')}
                disabled={baseButtonDisabled}
                aria-disabled={baseButtonDisabled}
                aria-label="Y-Axis B action - Turn Right"
                className={`
                  text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl
                  font-['VT323'] uppercase tracking-wider font-bold
                  transition-all duration-150 ease-in-out
                  focus:outline-none
                  p-1 sm:p-1.5 md:p-2 lg:p-2.5 xl:p-3 2xl:p-3
                  whitespace-nowrap
                  ${baseButtonDisabled ? 'opacity-50' : 'cursor-pointer'}
                `}
                style={getBaseButtonStyle(baseButtonDisabled)}
              >
                <span style={c64GreenBracketStyle} className={pressedButton === 'yAxisB' ? "blinking-bracket" : ""}>[</span>
                <span className={!baseButtonDisabled ? 'hover:text-white active:text-neutral-300' : ''}>
                  Y-AXIS B
                </span>
                <span style={c64GreenBracketStyle} className={pressedButton === 'yAxisB' ? "blinking-bracket" : ""}>]</span>
              </button>
              <button
                onClick={() => handleGenericButtonPress(
                  'zoomLvl', 
                  () => {
                    threeCityscapeRef.current?.zoomCameraByFactor(0.25);
                    console.log("Zoom LVL button clicked.");
                  }
                )}
                onMouseDown={() => handleButtonMouseDown('zoomLvl')}
                disabled={baseButtonDisabled}
                aria-disabled={baseButtonDisabled}
                aria-label="Adjust Zoom Level"
                className={`
                  text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl
                  font-['VT323'] uppercase tracking-wider font-bold
                  transition-all duration-150 ease-in-out
                  focus:outline-none
                  p-1 sm:p-1.5 md:p-2 lg:p-2.5 xl:p-3 2xl:p-3
                  whitespace-nowrap
                  ${baseButtonDisabled ? 'opacity-50' : 'cursor-pointer'}
                `}
                style={getBaseButtonStyle(baseButtonDisabled)}
              >
                <span style={c64GreenBracketStyle} className={pressedButton === 'zoomLvl' ? "blinking-bracket" : ""}>[</span>
                <span className={!baseButtonDisabled ? 'hover:text-white active:text-neutral-300' : ''}>
                  ZOOM LVL
                </span>
                <span style={c64GreenBracketStyle} className={pressedButton === 'zoomLvl' ? "blinking-bracket" : ""}>]</span>
              </button>
            </div>
          </div>
        )}


        <div
          className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 text-[9px] sm:text-[10px] md:text-[11px] opacity-85 z-20 font-['VT323'] text-right"
          style={infoTextStyle}
        >
          <p>SECTOR: <span style={infoTextStyle}>URBAN ZONE</span></p>
          <p>RENDER MODE: <span style={infoTextStyle}>NEON WIREFRAME</span></p>
        </div>

        <footer
          className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 text-[9px] sm:text-[10px] md:text-[11px] opacity-85 leading-tight z-20"
          style={infoTextStyle}
        >
          <p>&copy; 198X CITYNET SIMULATIONS INC.</p>
          <p>OS VER: {landscapeData && !isLoading ? '9.1.4-PROD' : (isLoading ? 'LOADING...' : 'STANDBY')}</p>
        </footer>

        <div className="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden z-10">
          {isLoading && (
            <div className="text-2xl flex flex-col items-center" style={infoTextStyle}>
              <LogoSpinner
                className="h-40 w-40 sm:h-56 sm:w-56 md:h-[308px] md:w-[308px] lg:h-96 lg:w-96 xl:h-[460px] xl:w-[460px] 2xl:h-[652px] 2xl:w-[652px] mb-1 sm:mb-2 md:mb-3"
                color={c64GreenStyle.color}
              />
            </div>
          )}
          {error && !isLoading && !error.toLowerCase().includes("api_key") && (
            <div className="text-center p-4 text-lg max-w-md bg-black/80 rounded backdrop-blur-sm" style={infoTextStyle}>
              <p>SYSTEM ERROR: DATASTREAM CORRUPTED</p>
              <p className="mt-1 text-base">{error.length > 150 ? error.substring(0, 147) + "..." : error}</p>
              <p className="mt-2 text-sm opacity-75">(CITY OFFLINE - ATTEMPT REGENERATION)</p>
            </div>
          )}
          {!isLoading && (!error || error.toLowerCase().includes("api_key")) && (
              <ThreeCityscape
                ref={threeCityscapeRef}
                landscapeData={landscapeData}
                globalCityColor={c64GreenStyle.color}
                onScreenshotInitiated={handleScreenshotInitiated}
                generateBuildingCluster={generateBuildingCluster}
              />
          )}
           {!isLoading && !error && !landscapeData && (
             <div className="text-xl" style={infoTextStyle}>AWAITING CITY DATA...</div>
          )}
        </div>

        {showScreenshotNotification && (
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 p-4 sm:p-5 md:p-6 bg-neutral-900/90 rounded-lg shadow-2xl flex flex-col items-center space-y-3"
            style={{
              color: c64GreenStyle.color,
              textShadow: c64GreenStyle.textShadow,
              backdropFilter: 'blur(3px)',
            }}
            role="alert"
            aria-live="polite"
          >
            <CameraIcon className="w-8 h-8 sm:w-10 sm:h-10" style={{color: c64GreenStyle.color}}/>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-pink-900/10 pointer-events-none z-30 opacity-20"></div>
        <div
          className="absolute inset-0 pointer-events-none z-30"
          style={{
            backgroundImage: 'linear-gradient(rgba(0,255,0,0.015) 50%, transparent 50%)',
            backgroundSize: '100% 3px',
            opacity: 0.25,
          }}
          aria-hidden="true"
        ></div>
        <div className="absolute inset-0 box-shadow-[inset_0_0_120px_40px_rgba(0,0,0,0.45)] pointer-events-none z-30"></div>
        
        {isFlashing && noiseDataURL && activeFlashType === 'generic' && !isStaticFlashingFullScreen && (
          <div
            className="absolute inset-0 z-[35] pointer-events-none"
            style={{
              backgroundImage: `url(${noiseDataURL})`,
              backgroundRepeat: 'repeat',
            }}
            aria-hidden="true"
          />
        )}

        {isStaticFlashingFullScreen && noiseDataURL && (
          <div
            className="absolute inset-0 z-[49] pointer-events-none" 
            style={{
                backgroundImage: `url(${noiseDataURL})`,
                backgroundRepeat: 'repeat',
            }}
            aria-hidden="true"
          />
        )}

        {isFlashing && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center z-[36] pointer-events-none"
            aria-hidden="true"
          >
            {activeFlashType === 'populate' && (
              <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[75vw] h-[65vh] max-w-[900px] rounded-lg flex flex-col overflow-hidden border-4 border-black"
                style={{ backgroundColor: c64GreenStyle.color }} 
              >
                <div 
                  className="h-8 sm:h-9 md:h-10 lg:h-11 xl:h-12 bg-black flex items-center justify-center shrink-0 px-2 sm:px-3"
                  style={{ color: c64GreenStyle.color, textShadow: c64GreenStyle.textShadow }}
                >
                  <span className="font-['VT323'] text-sm sm:text-base md:text-lg lg:text-xl uppercase truncate">
                    // CREATE POPULATION //
                  </span>
                </div>
                <div className="relative z-10 flex flex-col items-center justify-center text-center flex-grow p-1 sm:p-2 md:p-3 overflow-y-auto">
                  <LogoSpinner
                    className="h-20 w-20 sm:h-24 sm:w-24 md:h-32 md:w-32 lg:h-48 lg:w-48 xl:h-60 xl:w-60 2xl:h-72 2xl:w-72 mt-1 sm:mt-2 md:mt-3"
                    color="#000000" 
                  />
                  <h4 
                    className="font-['VT323'] text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl 2xl:text-3xl uppercase mt-1 sm:mt-2 md:mt-3 min-h-[1.5rem] sm:min-h-[1.75rem] md:min-h-[2rem] lg:min-h-[2.25rem] xl:min-h-[2.5rem] 2xl:min-h-[2.75rem] text-center break-words" 
                    style={blackTextStyle}
                  >
                    {currentCharacteristicText}
                    {currentCharacteristicText && (
                        <span className="blinking-bracket" style={blackTextStyle}>...</span>
                    )}
                  </h4>
                  <h3 
                    className="font-['VT323'] text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl 2xl:text-4xl uppercase mt-1 sm:mt-1.5 md:mt-2"
                    style={blackTextStyle}
                  >
                    {currentPopulationDisplay}
                  </h3>
                  <div 
                      className={`w-2/3 sm:w-1/2 md:w-5/12 lg:w-2/5 xl:w-1/4 mt-1 sm:mt-2 md:mt-3 border-2 ${populateLoaderBarHeightClasses} overflow-hidden font-['VT323'] text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl 2xl:text-3xl leading-none flex items-center`}
                      style={{ 
                          borderColor: '#000000',
                          color: '#000000', 
                          textShadow: 'none',
                        }}
                  >
                      <div 
                          className="h-full"
                          style={{ 
                              width: `${loaderProgress}%`,
                              backgroundColor: '#000000',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                          }}
                      >
                          {blockChars}
                      </div>
                  </div>
                </div>
              </div>
            )}
            {activeFlashType === 'research' && (
              <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[75vw] h-[65vh] max-w-[900px] rounded-lg flex flex-col overflow-hidden border-4 border-black"
                style={{ backgroundColor: c64GreenStyle.color }}
              >
                <div 
                  className="h-8 sm:h-9 md:h-10 lg:h-11 xl:h-12 bg-black flex items-center justify-center shrink-0 px-2 sm:px-3"
                  style={{ color: c64GreenStyle.color, textShadow: c64GreenStyle.textShadow }}
                >
                  <span className="font-['VT323'] text-sm sm:text-base md:text-lg lg:text-xl uppercase truncate">
                    // RESEARCH CENTER //
                  </span>
                </div>
                <div className="relative z-10 flex flex-col items-center justify-center text-center flex-grow p-1 sm:p-2 md:p-3 overflow-y-auto">
                  <LogoSpinner
                    className="h-20 w-20 sm:h-24 sm:w-24 md:h-32 md:w-32 lg:h-48 lg:w-48 xl:h-60 xl:w-60 2xl:h-72 2xl:w-72 mt-1 sm:mt-2 md:mt-3"
                    color="#000000" 
                  />
                  <h4 
                    className="font-['VT323'] text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl 2xl:text-3xl uppercase mt-1 sm:mt-2 md:mt-3 min-h-[1.5rem] sm:min-h-[1.75rem] md:min-h-[2rem] lg:min-h-[2.25rem] xl:min-h-[2.5rem] 2xl:min-h-[2.75rem] text-center break-words" 
                    style={blackTextStyle}
                  >
                    {currentCharacteristicText}
                    {currentCharacteristicText && (
                        <span className="blinking-bracket" style={blackTextStyle}>...</span>
                    )}
                  </h4>
                  <p 
                    className="font-['VT323'] text-sm sm:text-base md:text-lg lg:text-xl uppercase mt-1"
                    style={blackTextStyle}
                  >
                    DATA POINTS ANALYZED:
                  </p>
                  <h3 
                    className="font-['VT323'] text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl 2xl:text-4xl uppercase mt-0 sm:mt-0.5 md:mt-1"
                    style={blackTextStyle}
                  >
                    {currentPopulationDisplay}
                  </h3>
                  <div 
                      className={`w-2/3 sm:w-1/2 md:w-5/12 lg:w-2/5 xl:w-1/4 mt-1 sm:mt-2 md:mt-3 border-2 ${populateLoaderBarHeightClasses} overflow-hidden font-['VT323'] text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl 2xl:text-3xl leading-none flex items-center`}
                      style={{ 
                          borderColor: '#000000',
                          color: '#000000', 
                          textShadow: 'none',
                        }}
                  >
                      <div 
                          className="h-full"
                          style={{ 
                              width: `${loaderProgress}%`,
                              backgroundColor: '#000000',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                          }}
                      >
                          {blockChars}
                      </div>
                  </div>
                </div>
              </div>
            )}
              {activeFlashType === 'validate' && (
              <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[75vw] h-[65vh] max-w-[900px] rounded-lg flex flex-col overflow-hidden border-4 border-black"
                style={{ backgroundColor: c64GreenStyle.color }}
              >
                <div 
                  className="h-8 sm:h-9 md:h-10 lg:h-11 xl:h-12 bg-black flex items-center justify-center shrink-0 px-2 sm:px-3"
                  style={{ color: c64GreenStyle.color, textShadow: c64GreenStyle.textShadow }}
                >
                  <span className="font-['VT323'] text-sm sm:text-base md:text-lg lg:text-xl uppercase truncate">
                    // VALIDATE //
                  </span>
                </div>
                <div className="relative z-10 flex flex-col items-center justify-center text-center flex-grow p-1 sm:p-2 md:p-3 overflow-y-auto">
                  <LogoSpinner
                    className="h-20 w-20 sm:h-24 sm:w-24 md:h-32 md:w-32 lg:h-48 lg:w-48 xl:h-60 xl:w-60 2xl:h-72 2xl:w-72 mt-1 sm:mt-2 md:mt-3"
                    color="#000000" 
                  />
                  <h4 
                    className="font-['VT323'] text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl 2xl:text-3xl uppercase mt-1 sm:mt-2 md:mt-3 min-h-[1.5rem] sm:min-h-[1.75rem] md:min-h-[2rem] lg:min-h-[2.25rem] xl:min-h-[2.5rem] 2xl:min-h-[2.75rem] text-center break-words" 
                    style={blackTextStyle}
                  >
                    {currentCharacteristicText}
                    {currentCharacteristicText && (
                        <span className="blinking-bracket" style={blackTextStyle}>...</span>
                    )}
                  </h4>
                  <p 
                    className="font-['VT323'] text-sm sm:text-base md:text-lg lg:text-xl uppercase mt-1"
                    style={blackTextStyle}
                  >
                    CHECKS COMPLETED:
                  </p>
                  <h3 
                    className="font-['VT323'] text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl 2xl:text-4xl uppercase mt-0 sm:mt-0.5 md:mt-1"
                    style={blackTextStyle}
                  >
                    {currentPopulationDisplay}
                  </h3>
                  <div 
                      className={`w-2/3 sm:w-1/2 md:w-5/12 lg:w-2/5 xl:w-1/4 mt-1 sm:mt-2 md:mt-3 border-2 ${populateLoaderBarHeightClasses} overflow-hidden font-['VT323'] text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl 2xl:text-3xl leading-none flex items-center`}
                      style={{ 
                          borderColor: '#000000',
                          color: '#000000', 
                          textShadow: 'none',
                        }}
                  >
                      <div 
                          className="h-full"
                          style={{ 
                              width: `${loaderProgress}%`,
                              backgroundColor: '#000000',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                          }}
                      >
                          {blockChars}
                      </div>
                  </div>
                </div>
              </div>
            )}
             {activeFlashType === 'viewMap' && (
              <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[75vw] h-[65vh] max-w-[900px] rounded-lg flex flex-col overflow-hidden border-4 border-black"
                style={{ backgroundColor: c64GreenStyle.color }}
              >
                <div 
                  className="h-8 sm:h-9 md:h-10 lg:h-11 xl:h-12 bg-black flex items-center justify-center shrink-0 px-2 sm:px-3"
                  style={{ color: c64GreenStyle.color, textShadow: c64GreenStyle.textShadow }}
                >
                  <span className="font-['VT323'] text-sm sm:text-base md:text-lg lg:text-xl uppercase truncate">
                    // CITY TERRAIN //
                  </span>
                </div>
                <div className="relative z-10 flex flex-col items-start justify-start text-left flex-grow p-1 sm:p-2 md:p-3 overflow-hidden">
                    <div 
                        className="font-['VT323'] text-sm sm:text-base md:text-lg lg:text-xl w-full px-2 py-1"
                        style={blackTextStyle}
                    >
                        Generated city:&nbsp;
                        {typedMapCityNamePart}
                        {showMapCityCursor && (
                            <span className="blinking-bracket" style={blackTextStyle}>█</span>
                        )}
                    </div>
                  <div className="w-full flex-grow overflow-hidden"> {/* Container for map to fill remaining space */}
                    <RotatingWireframeMap color="#000000" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MonitorScreen;