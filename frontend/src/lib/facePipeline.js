const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

/**
 * @returns {Promise<import('@mediapipe/tasks-vision').FaceLandmarker>}
 */
export async function createFaceLandmarker() {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE)
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numFaces: 2,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
  try {
    return await FaceLandmarker.createFromOptions(vision, opts('GPU'))
  } catch {
    return await FaceLandmarker.createFromOptions(vision, opts('CPU'))
  }
}

/** Flatten first landmarks to 128 floats for server cosine match. */
export function embeddingFromLandmarks(landmarks) {
  if (!landmarks?.length) return null
  const out = []
  const cap = Math.min(landmarks.length, 42)
  for (let i = 0; i < cap; i++) {
    const l = landmarks[i]
    out.push(l.x, l.y, l.z ?? 0)
  }
  while (out.length < 128) out.push(0)
  return out.slice(0, 128)
}

export function averageEmbeddings(arrays) {
  if (!arrays.length) return null
  const len = 128
  const sum = new Array(len).fill(0)
  for (const a of arrays) {
    for (let i = 0; i < len; i++) sum[i] += a[i] ?? 0
  }
  return sum.map((x) => x / arrays.length)
}
