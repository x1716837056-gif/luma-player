from pathlib import Path
import os
import zipfile

root = Path(__file__).resolve().parents[1]
destination = root.parents[1] / 'Luma-source-updated.zip'
excluded = {'node_modules', '.git', 'dist', 'release', 'release-final', 'reference', 'verification-local'}
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for directory, folders, names in os.walk(root):
        folders[:] = [name for name in folders if name not in excluded]
        if Path(directory) == root / 'tools':
            folders[:] = []  # Runtime manifests are retained; binaries are restored with setup-tools.ps1.
        for name in names:
            if name.endswith('.tsbuildinfo'):
                continue
            item = Path(directory) / name
            archive.write(item, 'Luma-source/' + item.relative_to(root).as_posix())
with zipfile.ZipFile(destination) as archive:
    assert archive.testzip() is None
    count = len(archive.namelist())
print(f'Verified source ZIP: {destination} ({count} files, {destination.stat().st_size} bytes)')
