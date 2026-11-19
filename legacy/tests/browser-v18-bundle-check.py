from pathlib import Path
from playwright.sync_api import sync_playwright
import re
root=Path(__file__).resolve().parents[1]
files=['db.js','catalog.js','reading-metrics.js','session-clock.js','reading-habits.js','app.js']
allcode=[]
for fn in files:
 s=(root/fn).read_text()
 s=re.sub(r'^import .*?;\s*$', '', s, flags=re.MULTILINE)
 s=re.sub(r'\bexport (?=(?:async |const |class |function ))','',s)
 s=re.sub(r'^export \{.*?\};\s*$','',s,flags=re.MULTILINE)
 allcode.append(s)
code='const demoStorage={_m:{},getItem(k){return this._m[k]??null},setItem(k,v){this._m[k]=String(v)},removeItem(k){delete this._m[k]}}; globalThis.demoStorage=demoStorage;\n'+ '\n'.join(allcode).replace('localStorage','demoStorage')
from subprocess import run
check=Path('/mnt/data/rr-v18-browser-bundle-check.js');check.write_text(code)
p=run(['node','--check',str(check)],capture_output=True,text=True)
if p.returncode: print(p.stderr);raise RuntimeError('Bundle parse failed')
html=(root/'index.html').read_text()
html=re.sub(r'<script src="/config.js"></script>','',html)
html=re.sub(r'<script type="module" src="/app.js"></script>','',html)
html=html.replace('<link rel="stylesheet" href="/style.css" />','<style>'+ (root/'style.css').read_text() +'</style>')
# Source app includes no closing </script>; import source not executable instructions.
html=html.replace('</body>', '<script>'+code+'</script></body>')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':430,'height':932})
 errors=[];page.on('pageerror',lambda ex:errors.append(str(ex)))
 page.add_init_script("window.READING_ROOM_CONFIG={};")
 page.set_content(html,wait_until='load')
 page.wait_for_timeout(500)
 print('Errors:',errors[:3]);print('Headings:',page.locator('.section-title').all_inner_texts()[:16]);print('total chars',len(page.locator('body').inner_text()))
 page.screenshot(path='/mnt/data/rr-v18-actual-render.png',full_page=True,animations='disabled')
 try:
  page.locator('[data-tab="log"]').last.click(timeout=2000)
  print('Start-time input',page.locator('#log-start-time').count())
 except Exception as e:print('Log switch issue',str(e)[:300]);errors.append(str(e))
 browser.close()
 if errors:raise RuntimeError('Browser errors: '+str(errors))
