from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen

DEST = Path(__file__).resolve().parents[1] / 'public' / 'artwork'
POSTERS = {
    'dune2': '1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
    'interstellar': 'gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    'severance': 'pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg',
    'lalaland': 'uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg',
    'bladerunner': 'gajva2L0rPYkEWjzgFlBXCAVBE5.jpg',
    'oppenheimer': 'ptpr0kGAckfQkJeJIt8st5dglvd.jpg',
    'arrival': 'x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg',
    'inception': 'oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',
    'pastlives': 'k3waqVXSnvCZWfJYNtdamTgTtTA.jpg',
    'batman': '74xTEgt7R36Fpooo50r9T25onhq.jpg',
    'dune': 'd5NXSklXo0qyIYkgV94XAgMIckC.jpg',
    'bear': 'sHFlbKS3WLqMnp9t2ghADIJFnuQ.jpg',
}
BACKDROPS = {
    'dune2': 'eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
    'interstellar': 'pbrkL804c8yAv3zBZR4QPEafpAR.jpg',
    'severance': 'ixgFmf1X59PUZam2qbAfskx2gQr.jpg',
    'lalaland': 'nlPCdZlHtRNcF6C9hzUH4ebmV1w.jpg',
    'bladerunner': 'gNdLJU9TxrpGx4dkZidjys3fyy0.jpg',
    'oppenheimer': 'fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg',
    'arrival': '8MUZz7oPXQftFTslZpRP3CVMOoq.jpg',
    'inception': 's3TBrRGB1iav7gFOCNx3H31MoES.jpg',
    'pastlives': 'w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg',
    'batman': 'b0PlSFdDwbyK0cf5RxwDpaOJQvQ.jpg',
    'dune': 'jYEW5xZkZk2WTrdbMGAPFuBqbDc.jpg',
    'bear': 'aJtG4txtmiRHwAAqENQHZvBs6kY.jpg',
}

def download(item):
    name, image, size = item
    target = DEST / (name + '.jpg')
    if target.exists():
        return
    try:
        request = Request(f'https://image.tmdb.org/t/p/{size}/{image}', headers={'User-Agent': 'Luma-Prototype/0.1'})
        with urlopen(request, timeout=30) as response:
            target.write_bytes(response.read())
        print(name, target.stat().st_size)
    except Exception as error:
        print('FAILED', name, str(error))

DEST.mkdir(parents=True, exist_ok=True)
with ThreadPoolExecutor(max_workers=6) as pool:
    list(pool.map(download, [(name, path, 'w500') for name, path in POSTERS.items()] + [(name + '-bg', path, 'w1280') for name, path in BACKDROPS.items()]))
