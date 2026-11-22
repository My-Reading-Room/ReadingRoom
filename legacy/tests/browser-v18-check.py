import os,threading,http.server,socketserver,time
from playwright.sync_api import sync_playwright
from pathlib import Path
root=Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(root),**kwargs)
    def log_message(self,*args):pass
server=socketserver.TCPServer(('127.0.0.1',8766),Handler)
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':430,'height':932},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda exc:errors.append(str(exc)))
 page.goto('http://127.0.0.1:8766/',wait_until='domcontentloaded')
 page.wait_for_timeout(1200)
 page.screenshot(path='/mnt/data/rr-v18-live-app-insights.png',full_page=True,animations='disabled')
 print('initial',page.locator('body').inner_text()[:270])
 print('all analytics', [(v,page.locator('body').get_by_text(v,exact=False).count()) for v in ['Reading Habits','Reading by time of day','Day of week × time of day','TBR aging','Books & Library']])
 print('browser errors',errors)
 page.locator('[data-tab="log"]').first.click()
 page.wait_for_timeout(100)
 print('log time input',page.locator('#log-start-time').count())
 page.screenshot(path='/mnt/data/rr-v18-live-app-log.png',full_page=True,animations='disabled')
 browser.close()
server.shutdown()
if errors:raise RuntimeError('Browser errors '+str(errors))
