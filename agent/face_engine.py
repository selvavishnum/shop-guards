"""
Local face-recognition engine for the ShopGuard on-site agent.

Pipeline (runs entirely on the shop machine — CPU only, no GPU required):

    RTSP frame -> face detector (InsightFace's bundled SCRFD, YOLO-class
    accuracy purpose-built for faces) -> ArcFace recognition model produces
    a 512-dimension, L2-normalized embedding per detected face -> matched
    against enrolled staff via cosine similarity (dot product of normalized
    vectors). A shop has a handful of staff, so brute-force comparison is
    microseconds — no vector database needed.

Embeddings for enrolled staff never leave this machine as raw face data —
only the resulting 512-float vector is pushed to the cloud, and only match
results (not faces) are sent when attendance is logged.
"""
import numpy as np


class FaceEngine:
    def __init__(self, det_size=(640, 640)):
        from insightface.app import FaceAnalysis
        self.app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        self.app.prepare(ctx_id=0, det_size=det_size)

    def detect(self, frame_bgr):
        """Returns [{bbox, embedding (512-d np.float32, L2-normalized), det_score}, ...]."""
        faces = self.app.get(frame_bgr)
        out = []
        for f in faces:
            out.append({
                "bbox":       [float(v) for v in f.bbox],
                "embedding":  f.normed_embedding.astype(np.float32),
                "det_score":  float(f.det_score),
            })
        return out

    @staticmethod
    def cosine(a, b):
        # Both vectors are already L2-normalized, so the dot product IS the
        # cosine similarity — no need to divide by norms.
        return float(np.dot(a, b))

    @classmethod
    def best_match(cls, embedding, enrolled, threshold=0.40):
        """enrolled: [{id, name, embedding: [floats]}, ...].
        Returns (staff_dict, score) if the best match clears `threshold`,
        else (None, best_score_seen) so callers can log near-misses if useful."""
        best_staff, best_score = None, -1.0
        for person in enrolled:
            score = cls.cosine(embedding, np.array(person["embedding"], dtype=np.float32))
            if score > best_score:
                best_score, best_staff = score, person
        if best_staff is not None and best_score >= threshold:
            return best_staff, best_score
        return None, best_score
