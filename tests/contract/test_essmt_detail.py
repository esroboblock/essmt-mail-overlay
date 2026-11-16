"""Run from the merged ESSMT checkout with its dev dependencies and Docker."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

import pytest
from playwright.sync_api import sync_playwright

from tests.integration_pg.test_mail_overlay_http import NAMESPACE, server, synthetic
from tests.integration_pg.test_mail_overlay_mv3 import _synthetic_certificate

pytestmark = pytest.mark.pg_required
OVERLAY = Path(os.environ.get("OVERLAY_CHECKOUT", Path(__file__).resolve().parents[2])).resolve()
FIXTURE = "http://localhost:4173/v2/read/-1/102"


def test_installed_overlay_editor_against_essmt(tmp_path, synthetic, server):
    cert, key, public_der = _synthetic_certificate(tmp_path)
    digest = hashlib.sha256(public_der).hexdigest()[:32]
    extension_id = digest.translate(str.maketrans("0123456789abcdef", "abcdefghijklmnop"))
    extension_origin = "chrome-extension://" + extension_id
    pin = base64.b64encode(hashlib.sha256(public_der).digest()).decode()
    extension = tmp_path / "overlay"
    with server(
        tls_cert=cert,
        tls_key=key,
        DEBUG="false",
        MAIL_OVERLAY_ALLOWED_EXTENSION_ORIGINS=json.dumps([extension_origin]),
        MAIL_OVERLAY_TAG_WRITE_ENABLED="true",
        MAIL_OVERLAY_TAG_WRITE_ALLOWED_USER_IDS=json.dumps([synthetic[0]]),
    ) as client:
        origin = str(client.base_url).rstrip("/")
        subprocess.run(
            ["node", "--input-type=module", "-e",
             "import { buildExtension } from './scripts/build-extension.mjs'; "
             "const [origin, namespace, destination] = process.argv.slice(1); "
             "await buildExtension({ origin, namespace, destination, detailFixture: true });",
             origin, NAMESPACE, str(extension)],
            cwd=OVERLAY, check=True,
        )
        manifest_path = extension / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["key"] = base64.b64encode(public_der).decode()
        manifest_path.write_text(json.dumps(manifest))

        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                str(tmp_path / "profile"), channel="chromium", headless=True,
                args=[
                    f"--disable-extensions-except={extension}",
                    f"--load-extension={extension}",
                    f"--ignore-certificate-errors-spki-list={pin}",
                ],
            )
            try:
                context.route("**/*", lambda route: (
                    route.continue_() if route.request.url.startswith((origin + "/", extension_origin + "/")) else route.abort()
                ))
                context.route(origin + "/dashboard", lambda route: route.fulfill(status=204))
                context.route(FIXTURE, lambda route: route.fulfill(content_type="text/html", body="""
                    <!doctype html><meta charset="utf-8"><span id="gnb_name1">Synthetic account</span>
                    <main><div class="mail_toolbar type_read"></div>
                    <article class="contents_area is_read" data-fixture-mail-sn="102"
                             data-fixture-ready="true">Synthetic message</article></main>
                """))
                login = context.pages[0]
                login.goto(origin + "/login")
                login.locator("#full_name").fill("HTTP synthetic employee")
                login.locator("#password").fill(synthetic[3])
                with login.expect_response(lambda r: r.url == origin + "/login" and r.request.method == "POST") as signed_in:
                    login.locator("button[type=submit]").click()
                assert signed_in.value.status == 303

                options = context.new_page()
                options.goto(extension_origin + "/options.html")
                options.locator("#mode").select_option("essmt")
                options.wait_for_function("async () => (await chrome.storage.local.get('mode')).mode === 'essmt'")
                page = context.new_page()
                page.goto(FIXTURE)
                cdp = context.new_cdp_session(page)

                def find(role, name, enabled=False):
                    for _ in range(100):
                        nodes = cdp.send("Accessibility.getFullAXTree")["nodes"]
                        for node in nodes:
                            if (not node["ignored"] and node.get("role", {}).get("value") == role
                                    and re.search(name, node.get("name", {}).get("value", ""))
                                    and (not enabled or not any(p["name"] == "disabled" and p["value"]["value"]
                                                              for p in node.get("properties", [])))):
                                return node
                        page.wait_for_timeout(50)
                    pytest.fail(f"Missing {role}: {name}")

                def click(role, name):
                    node = find(role, name, enabled=True)
                    x0, y0, _, _, x1, y1, _, _ = cdp.send(
                        "DOM.getBoxModel", {"backendNodeId": node["backendDOMNodeId"]}
                    )["model"]["content"]
                    page.mouse.click((x0 + x1) / 2, (y0 + y1) / 2)

                click("button", "데이터셋 일치 확인")
                find("StaticText", "공유 태그 없음")
                click("button", "합성 HTTP 태그 부착")
                find("button", "합성 HTTP 태그 해제", enabled=True)
                click("textbox", "새 태그 이름")
                page.keyboard.insert_text("새 통합 태그")
                page.keyboard.press("Enter")
                find("button", "새 통합 태그 해제", enabled=True)
                click("textbox", "새 태그 이름")
                page.keyboard.insert_text("새 통합 태그")
                page.keyboard.press("Enter")
                find("StaticText", "변경 사항이 없습니다")
                click("button", "새 통합 태그 해제")
                find("StaticText", "태그를 변경했습니다")
                assert "새 통합 태그 해제" not in [
                    node.get("name", {}).get("value") for node in cdp.send("Accessibility.getFullAXTree")["nodes"]
                ]
            finally:
                context.close()
