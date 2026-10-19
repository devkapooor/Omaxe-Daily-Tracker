"""Redact text evidence; retain screenshots, financial values and failure assertions."""
import json
import re
import zipfile
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
run_id = sys.argv[1] if len(sys.argv) > 1 else '2026-10-12-drill-01'
if not re.fullmatch(r'[A-Za-z0-9_-]+', run_id):
    raise ValueError('Invalid local evidence run ID')
evidence_root = (root / 'output/playwright').resolve()
run = (evidence_root / run_id).resolve()
run.relative_to(evidence_root)
passwords = ['DrillSynthetic123!', 'DrillChanged123!', 'SyntheticWrongPassword!']
jwt = re.compile(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*')
field = re.compile(r'((?:\\?"|\b)(?:idToken|refreshToken|accessToken|oobCode)(?:\\?"|\b)\s*:\s*\\?")[^"\\\s]+', re.I)
form = re.compile(r'((?:refresh_token|oobCode)=)[^&\s"\\]+', re.I)
counts = {'textFiles': 0, 'traceZips': 0, 'changedResources': 0}

def clean(text):
    for password in passwords:
        text = text.replace(password, '[REDACTED_SYNTHETIC_PASSWORD]')
    text = jwt.sub('[REDACTED_TOKEN]', text)
    text = field.sub(r'\1[REDACTED_TOKEN]', text)
    return form.sub(r'\1[REDACTED_TOKEN]', text)

for file in run.rglob('*'):
    if not file.is_file():
        continue
    file.resolve().relative_to(run)
    if file.suffix in {'.json', '.jsonl', '.txt', '.log', '.md', '.html'}:
        try:
            original = file.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue
        redacted = clean(original)
        if redacted != original:
            file.write_text(redacted, encoding='utf-8')
            counts['textFiles'] += 1
    elif file.name == 'trace.zip':
        temp = file.with_name('trace.redacted.tmp')
        changed = 0
        with zipfile.ZipFile(file) as original, zipfile.ZipFile(temp, 'w', zipfile.ZIP_DEFLATED) as target:
            for entry in original.infolist():
                data = original.read(entry.filename)
                try:
                    text = data.decode('utf-8')
                    redacted = clean(text)
                    if redacted != text:
                        data = redacted.encode('utf-8')
                        changed += 1
                except UnicodeDecodeError:
                    pass
                target.writestr(entry, data)
        temp.resolve().relative_to(run)
        temp.replace(file)
        counts['traceZips'] += 1
        counts['changedResources'] += changed

(run / 'redaction.json').write_text(json.dumps({'complete': True, 'policy': 'Tokens, OOB codes and synthetic passwords redacted; binary screenshots and original financial assertions/failures retained.', **counts}, indent=2), encoding='utf-8')
print(json.dumps(counts))
