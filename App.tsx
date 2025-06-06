import React, { useState, useCallback, useEffect } from 'react';
import MonitorScreen from './components/MonitorScreen';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// Ensure API_KEY is available in the environment
if (!process.env.API_KEY) {
  console.error("API_KEY is not set. Please ensure the environment variable is configured.");
}
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

export interface SkySettings {
  topColor: string;
  horizonColor: string;
}

export interface CityElementData {
  id: string;
  type: 'building'; 
  shape: 'box' | 'cylinder'; // Made non-optional
  position: { x: number; y: number; z: number };
  dimensions: {
    height: number; // Made non-optional
    width?: number;
    depth?: number;
    radius?: number;
  };
  orientationY?: number; 
}

export interface LandscapeData {
  sky: SkySettings;
  buildings: CityElementData[];
}

// C64 Green Glow Style
const c64GreenStyle = {
  color: '#a3e635', // lime-400
  textShadow: '0 0 2px #a3e635, 0 0 5px #66ff66, 0 0 8px #33cc33',
};

// Unified and robust validation function for building elements
const isValidBuildingElement = (el: any): el is CityElementData => {
  if (typeof el !== 'object' || el === null) return false;
  if (typeof el.id !== 'string' || el.id.trim() === '') return false;
  if (el.type !== 'building') return false;
  if (el.shape !== 'box' && el.shape !== 'cylinder') return false;

  if (typeof el.position !== 'object' || el.position === null) return false;
  if (typeof el.position.x !== 'number' || typeof el.position.y !== 'number' || typeof el.position.z !== 'number') return false;
  if (el.position.y !== 0) return false; // Must be ground-based

  if (typeof el.dimensions !== 'object' || el.dimensions === null) return false;
  if (typeof el.dimensions.height !== 'number' || el.dimensions.height <= 0) return false;

  if (el.shape === 'box') {
    if (typeof el.dimensions.width !== 'number' || el.dimensions.width <= 0) return false;
    if (typeof el.dimensions.depth !== 'number' || el.dimensions.depth <= 0) return false;
  } else if (el.shape === 'cylinder') {
    if (typeof el.dimensions.radius !== 'number' || el.dimensions.radius <= 0) return false;
  }

  if (el.orientationY !== undefined && typeof el.orientationY !== 'number') return false;

  return true;
};


const App: React.FC = () => {
  const [landscapeData, setLandscapeData] = useState<LandscapeData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const generateNewLandscape = useCallback(async () => {
    if (!process.env.API_KEY) {
      setError("API_KEY is missing. Cannot generate landscape data.");
      setIsLoading(false);
      setLandscapeData(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const randomSeed = Math.random().toString(36).substring(7);
      const prompt = `
CRITICAL INSTRUCTION: Your entire response MUST be a single, valid JSON object.
Do NOT include any text, comments, explanations, or any characters before the opening '{' or after the closing '}' of the JSON.
Do NOT include any non-JSON compliant characters or comments within the JSON structure itself.
The output must be parseable as JSON directly.

Generate JSON data for a retro 80s synthwave-style 3D city environment.
All elements are rendered as glowing Commodore 64 green wireframes.
The camera view starts high above, looking down at about a 30-degree angle with a wide-angle lens effect.
The scene features dynamically appearing/recycled buildings.
Ensure building positions are reasonably spaced out to minimize visual overlap, maintaining the overall density.

The JSON output MUST be a single object strictly following this structure:
{
  "sky": {
    "topColor": "string (hex, e.g., dark indigo '#2c003e')",
    "horizonColor": "string (hex, e.g., vibrant pink '#ff00cc')"
  },
  "buildings": [
    {
      "id": "string (unique id, e.g., 'bld_123')",
      "type": "string ('building')",
      "shape": "string ('box', 'cylinder')",
      "position": {
        "x": "number (integer or float, e.g., -100, 50.5, between -150 and 150)",
        "y": "number (must be 0)",
        "z": "number (integer or float, e.g., -200, 30.75, between -500 and 70)"
      },
      "dimensions": {
        "width": "number (integer or float, e.g., 10, 25.5, for box shape: 5-50)",
        "height": "number (integer or float, e.g., 50, 120.2, for all shapes: 10-200)",
        "depth": "number (integer or float, e.g., 10, 25.5, for box shape: 5-50)",
        "radius": "number (integer or float, e.g., 5, 12.5, for cylinder shape: 3-25)"
      },
      "orientationY": "number (optional, e.g., 0, 1.57, 3.1415; if present, must be an integer or a float with at least one digit after the decimal point like 0.0 or 2.5; range: 0 to 6.28 inclusive)"
    }
  ]
}

Details:
- Building Style: Buildings are glowing C64 green wireframes. Generate 30-42 'building' elements with a wide variety of dimensions.
- CRUCIAL constraint: Every element in the 'buildings' array MUST have its 'type' field set to the exact string 'building'.
- CRUCIAL constraint: Every element in the 'buildings' array MUST have a 'shape' field that is either 'box' or 'cylinder'.
- CRUCIAL constraint: Every element in the 'buildings' array MUST have a 'dimensions.height' field with a positive number.
- CRUCIAL constraint: If shape is 'box', 'dimensions.width' and 'dimensions.depth' MUST be present and positive. If shape is 'cylinder', 'dimensions.radius' MUST be present and positive.
- CRUCIAL constraint: 'position.y' MUST be 0 for all buildings.
- Numbers: Ensure all numeric values are valid JSON numbers. Floats must have digits after the decimal point if a decimal point is used (e.g., 10.0, not 10.). Integers are fine. No trailing commas.
- Positions and Dimensions: All position and dimension values must be numbers. No text or comments should be placed within these number fields or alongside them within the JSON structure.
- Spacing: Pay attention to 'position.x' and 'position.z' along with 'dimensions' to ensure buildings do not excessively clip into each other.
- Unique request ID (ignore this line, do not include in output): ${randomSeed}
`;

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-04-17',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 }
        },
      });

      let jsonStr = response.text.trim();
      const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
      const match = jsonStr.match(fenceRegex);
      if (match && match[2]) {
        jsonStr = match[2].trim();
      }

      try {
        const parsedData = JSON.parse(jsonStr);
        
        const minBuildings = 25; 
        const maxBuildings = 50;

        if (
          parsedData.sky &&
          typeof parsedData.sky.topColor === 'string' &&
          typeof parsedData.sky.horizonColor === 'string' &&
          Array.isArray(parsedData.buildings) && 
          parsedData.buildings.length >= minBuildings &&
          parsedData.buildings.length <= maxBuildings &&
          parsedData.buildings.every(isValidBuildingElement) // Use unified validator
        ) {
          setLandscapeData(parsedData as LandscapeData);
        } else {
          console.error("Parsed JSON data missing crucial fields or not in expected format:", parsedData);
          let errorDetail = "Parsed JSON data is not in the expected LandscapeData format.";
          if (!parsedData.sky || !parsedData.sky.topColor || !parsedData.sky.horizonColor) errorDetail += " Missing or invalid sky data.";
          if (!Array.isArray(parsedData.buildings) || parsedData.buildings.length < minBuildings || parsedData.buildings.length > maxBuildings) {
             errorDetail += ` Buildings array issue: expected ${minBuildings}-${maxBuildings} buildings, got ${parsedData.buildings?.length || 0}.`;
          }
          else if (!parsedData.buildings.every(isValidBuildingElement)) { // Use unified validator
            errorDetail += " Invalid building element structure. One or more buildings failed validation.";
            // Log which buildings failed
            parsedData.buildings.forEach((b: any, index: number) => {
                if (!isValidBuildingElement(b)) {
                    console.warn(`Building at index ${index} failed validation:`, JSON.stringify(b, null, 2));
                }
            });
          }
          throw new Error(errorDetail);
        }
      } catch (e) {
        console.error("Failed to parse JSON response:", e, "Raw response:", jsonStr);
        const rawResponseLog = jsonStr.length < 2000 ? jsonStr : jsonStr.substring(0, 1997) + "...";
        throw new Error(`Failed to parse landscape data from API. Invalid JSON structure. Raw: ${rawResponseLog}`);
      }

    } catch (err) {
      console.error("Error generating landscape data:", err);
      let errorMessage = "Failed to generate landscape data. Please try again.";
      if (err instanceof Error) {
        errorMessage = err.message.includes("API key not valid")
          ? "API Key is not valid. Please check your configuration."
          : `Error: ${err.message}`;
      }
      setError(errorMessage);
      setLandscapeData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const generateBuildingCluster = useCallback(async (clusterIdPrefix: string): Promise<CityElementData[] | null> => {
    if (!process.env.API_KEY) {
      console.error("API_KEY is missing. Cannot generate building cluster.");
      return null;
    }
    try {
      const randomSeed = Math.random().toString(36).substring(7);
      const prompt = `
ABSOLUTELY CRITICAL INSTRUCTION: Your ENTIRE response MUST be a single, valid JSON array.
It MUST start with '[' and end with ']'.
It must be directly parseable by JSON.parse() without any modification.
Do NOT include ANY text, comments, explanations, examples, or markdown before, after, or within the JSON array itself.

Generate JSON data for a small cluster of 5-8 retro 80s synthwave-style 3D city buildings.
All buildings are rendered as glowing Commodore 64 green wireframes.
The buildings in this cluster MUST be positioned relative to a (0,0,0) origin for this request, as if (0,0,0) is the center of this specific cluster. Their actual world positions will be offset later.

The JSON output MUST be an array of 5-8 'building' elements strictly following this structure:
[
  {
    "id": "string (unique id within this cluster, e.g., 'bld_part_001')",
    "type": "string ('building')",
    "shape": "string ('box', 'cylinder')",
    "position": { 
      "x": "number (integer or float, e.g., -30, 15.5, generally within -60 to 60 for good clustering)",
      "y": "number (must be 0)",
      "z": "number (integer or float, e.g., -20, 40.75, generally within -60 to 60 for good clustering)"
    },
    "dimensions": { 
      "width": "number (integer or float, e.g., 10.0, 25.5, REQUIRED for 'box' shape, range: 5-40)",
      "height": "number (integer or float, e.g., 50.0, 120.2, REQUIRED for all shapes, range: 10-180)",
      "depth": "number (integer or float, e.g., 10.0, 25.5, REQUIRED for 'box' shape, range: 5-40)",
      "radius": "number (integer or float, e.g., 5.0, 12.5, REQUIRED for 'cylinder' shape, range: 3-20)"
    },
    "orientationY": "number (optional, e.g., 0, 1.57; range: 0 to 6.28)"
  }
]

Details for this cluster:
- Cluster Size: Exactly 5 to 8 buildings.
- Relative Positioning: 'position.x' and 'position.z' values MUST be relative to an implicit (0,0,0) origin for this cluster. Do not use large world coordinates.
- Intra-Cluster Spacing: Ensure buildings within THIS generated cluster are reasonably spaced out from each other.
- JSON Syntax Rules:
    - All keys and string values MUST be enclosed in double quotes (e.g., "id": "bld_001").
    - Numeric values MUST NOT be enclosed in quotes (e.g., "x": -30.0, NOT "x": "-30.0").
    - No trailing commas are allowed after the last element in an array or the last property in an object.
    - Ensure all brackets ('[]') and braces ('{}') are correctly paired and closed.
    - Commas MUST separate elements in an array and properties in an object (except before the closing bracket/brace of the last item).
- CRUCIAL constraint on 'type': Every element in the array MUST have its 'type' field set to the exact string "building".
- CRUCIAL constraint on 'shape': Every element in the array MUST have a 'shape' field that is either "box" or "cylinder".
- CRUCIAL constraint on 'dimensions' object:
    - The 'dimensions' object MUST always contain a 'height' key with a positive numeric value.
    - If 'shape' is "box", the 'dimensions' object MUST ALSO contain 'width' AND 'depth' keys, each with a positive numeric value. Example: "dimensions": { "width": 20.0, "height": 100.0, "depth": 15.0 }
    - If 'shape' is "cylinder", the 'dimensions' object MUST ALSO contain a 'radius' key with a positive numeric value. Example: "dimensions": { "radius": 10.0, "height": 150.0 }
- CRUCIAL constraint on 'position.y': Must be 0 for all buildings.
- Numbers: All numeric values must be valid JSON numbers. Floats should be like 10.0 or 2.5. Integers are fine (e.g., 10).
- FINAL CHECK: Before outputting, please METICULOUSLY re-verify that ALL above constraints are met, especially JSON syntax rules, 'type', 'shape', and the mandatory presence of ALL required dimension fields (height; width/depth for box; radius for cylinder) for each shape. The output must be 100% valid parseable JSON.
- Unique request ID (ignore this line, do not include in output): ${randomSeed}
`;

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-04-17',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 } 
        },
      });
      
      let jsonStr = response.text.trim();
      const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
      const match = jsonStr.match(fenceRegex);
      if (match && match[2]) {
        jsonStr = match[2].trim();
      }

      const parsedClusterData = JSON.parse(jsonStr);
      
      if (Array.isArray(parsedClusterData) && parsedClusterData.length >= 5 && parsedClusterData.length <= 8 && parsedClusterData.every(isValidBuildingElement)) { // Use unified validator
        return parsedClusterData.map(b => ({
          ...b,
          id: `${clusterIdPrefix}${b.id}` 
        })) as CityElementData[];
      } else {
        console.error("Parsed cluster JSON data not in expected format:", parsedClusterData);
        if (Array.isArray(parsedClusterData)) {
            parsedClusterData.forEach((b: any, index: number) => {
                if (!isValidBuildingElement(b)) { // Use unified validator
                    console.warn(`Cluster building at index ${index} failed validation:`, JSON.stringify(b, null, 2));
                }
            });
        }
        return null;
      }
    } catch (err) {
      console.error("Error generating building cluster:", err);
      if (err instanceof SyntaxError && err.message.includes("JSON")) {
        // Already logged by the try-catch in main generation if it's JSON syntax
      }
      return null;
    }
  }, []);


  useEffect(() => {
    generateNewLandscape();
  }, [generateNewLandscape]);

  return (
    <div className="bg-black w-screen h-screen flex flex-col items-center justify-center font-['VT323'] selection:bg-pink-500 selection:text-black overflow-hidden"
         style={{ color: c64GreenStyle.color, cursor: 'none' }}
    >

      <main className="w-full h-full flex flex-col items-center justify-center relative">
        <MonitorScreen
          landscapeData={landscapeData}
          isLoading={isLoading}
          error={error}
          onGenerateClick={generateNewLandscape}
          isGenerating={isLoading}
          canGenerate={!!process.env.API_KEY} 
          c64GreenStyle={c64GreenStyle}
          generateBuildingCluster={generateBuildingCluster}
        />

        {error && !isLoading && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 max-w-lg w-11/12">
            <p
              className="text-center text-sm sm:text-base bg-neutral-900/90 p-3 rounded shadow-xl break-words"
              style={c64GreenStyle}
            >
              {error.startsWith("API Key is not valid") ? "ERROR: API Key not valid. Check console." : `SYSTEM ERROR: ${error}`}
            </p>
          </div>
        )}
         {!process.env.API_KEY && ( 
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 max-w-lg w-11/12">
            <p
              className="text-center text-sm sm:text-base bg-neutral-900/90 p-3 rounded shadow-xl"
              style={c64GreenStyle}
            >
              CRITICAL ERROR: API_KEY is not configured. Application functionality is limited.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;