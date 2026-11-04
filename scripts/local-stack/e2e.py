import re, sys
from playwright.sync_api import sync_playwright
B="http://localhost:3000"; S="/home/claude/shots/"
def login(page, email):
    page.goto(B+"/login"); page.fill("input[name=email]", email); page.fill("input[name=password]", "Test-Password-123")
    page.click("button[type=submit]"); page.wait_for_url(B+"/", timeout=20000)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    errs=[]
    ctx = br.new_context(viewport={"width":1400,"height":900}, locale="he-IL", timezone_id="Asia/Jerusalem")
    page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(page.url+" :: "+str(e)[:40]))
    page.goto(B+"/login"); page.screenshot(path=S+"01-login.png")
    # intruder blocked
    page.fill("input[name=email]", "intruder@elm.test"); page.fill("input[name=password]", "Test-Password-123"); page.click("button[type=submit]")
    page.wait_for_selector("text=החשבון אינו פעיל", timeout=15000); print("intruder blocked OK")
    login(page, "admin@elm.test")
    page.goto(B+"/import"); page.set_input_files("input[type=file]", "/home/claude/elm-sales/tests/fixture-customers.xlsx")
    page.click("text=העלאה ותצוגה מקדימה"); page.wait_for_url(re.compile(r".*batch=.*"), timeout=30000)
    page.screenshot(path=S+"02-import-preview.png", full_page=True)
    page.select_option("select[name=owner_id]", label="דנה מכירות")
    page.click("button:has-text('ייבוא ')"); page.wait_for_selector("text=נוצרו", timeout=60000)
    print("IMPORT:", page.locator("p:has-text('נוצרו')").first.inner_text())
    page.goto(B+"/data-quality"); page.screenshot(path=S+"03-data-quality.png", full_page=True)
    page.goto(B+"/customers"); page.screenshot(path=S+"04-customers-admin.png")
    ctx.clear_cookies()
    # dana
    login(page, "dana@elm.test")
    page.goto(B+"/plan"); page.click("button:has-text('תצוגה מקדימה')"); page.wait_for_selector("text=סיכום התצוגה המקדימה", timeout=60000)
    page.screenshot(path=S+"05-plan-preview.png", full_page=True)
    page.click("text=שמירת התוכנית"); page.wait_for_selector("text=/נשמרו \\d+ ביקורים/", timeout=60000)
    print("PLAN:", page.locator("text=/נשמרו \\d+ ביקורים/").first.inner_text())
    page.goto(B+"/"); page.screenshot(path=S+"06-today.png", full_page=True)
    # complete first call: no answer
    page.locator("button:has-text('סיום ותיעוד')").first.click()
    page.click("label:has-text('אין מענה')"); page.select_option("select[name=follow_type]", "")
    page.locator("dialog[open] button[type=submit]").click(); page.wait_for_timeout(2500)
    # complete next call: done with follow-up
    page.locator("button:has-text('סיום ותיעוד')").first.click()
    page.fill("dialog[open] textarea[name=outcome]", "דיברתי עם מנהל הייצור, מעוניין במרכז עיבוד אנכי")
    page.fill("dialog[open] input[name=next_step]", "לשלוח מפרט")
    page.locator("dialog[open] button[type=submit]").click(); page.wait_for_timeout(2500)
    page.screenshot(path=S+"07-today-after.png", full_page=True)
    print("PROGRESS:", page.locator("text=שיחות שהתקיימו").locator("..").inner_text().replace("\n"," "))
    page.goto(B+"/calendar?view=week&date=2026-11-08"); page.screenshot(path=S+"08-week.png", full_page=True)
    page.goto(B+"/calendar?view=month&date=2026-11-04"); page.screenshot(path=S+"09-month.png", full_page=True)
    page.goto(B+"/customers"); page.locator("ul li a").first.click(); page.wait_for_load_state("networkidle")
    page.screenshot(path=S+"10-card.png", full_page=True)
    # create opportunity
    page.click("#opps button:has-text('חדשה')"); page.fill("dialog[open] input[name=title]", "מרכז עיבוד לקו חדש")
    page.locator("dialog[open] button[type=submit]").click(); page.wait_for_timeout(2000)
    page.goto(B+"/opportunities"); page.screenshot(path=S+"11-kanban.png", full_page=True)
    page.goto(B+"/route?date=2026-11-09"); page.screenshot(path=S+"12-route.png", full_page=True)
    page.goto(B+"/reports"); page.screenshot(path=S+"13-reports.png", full_page=True)
    # forbidden page for sales
    page.goto(B+"/import"); print("sales /import ->", page.url)
    # mobile
    m = br.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True, locale="he-IL", timezone_id="Asia/Jerusalem", storage_state=ctx.storage_state())
    mp = m.new_page(); mp.goto(B+"/"); mp.screenshot(path=S+"14-mobile-today.png", full_page=True)
    mp.goto(B+"/customers"); mp.screenshot(path=S+"15-mobile-customers.png")
    mp.goto(B+"/calendar?view=month"); mp.screenshot(path=S+"16-mobile-month.png", full_page=True)
    # persistence after reload/re-login
    ctx.clear_cookies(); login(page, "dana@elm.test"); page.goto(B+"/reports"); print("REPORT calls done:", page.locator("table").first.inner_text().replace("\n"," | ")[:200])
    print("page errors:", errs[:5])
    br.close()
