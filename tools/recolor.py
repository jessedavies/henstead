"""Per-model vertex colour changes applied while packing. Colours are linear 0..1 tuples (three.js vertex colours).

The KayKit dog is a golden puppy; this repaints its fur as a black and white border collie:
white chest, paws, muzzle and blaze, black everywhere else. Eyes, nose and tongue keep their colours.
"""
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

FUR = tuple(_lin(v / 255) for v in (218, 174, 126))
BLACK = tuple(_lin(v) for v in (0.16, 0.16, 0.18))
WHITE = tuple(_lin(v) for v in (0.96, 0.95, 0.91))

def _is_fur(c):
    return all(abs(a - b) < 0.02 for a, b in zip(c, FUR))

def _collie(part, p):
    x, y, z = p
    if part.endswith('dogHead'):
        if abs(x) > 0.42: return BLACK                       # ears
        if z > 0.42 and y < 0.42: return WHITE                # muzzle
        if abs(x) < 0.09 and z > 0.25 and y < 0.8: return WHITE  # blaze up the face
        return BLACK
    if 'Arm' in part:
        return WHITE if y < -0.27 else BLACK                  # white paws
    return WHITE if z > 0.12 or y < 0.12 else BLACK          # body: white chest and belly

def apply(model, part, pos, col):
    if model != 'character_dog':
        return col
    return [(_collie(part, p) if _is_fur(c) else c) for p, c in zip(pos, col)]
