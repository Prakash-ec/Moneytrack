import json
import urllib.request
import sys
import websocket

def get_page_ws_url():
    data = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read().decode())
    for item in data:
        if item.get("type") == "page" and "localhost" in item.get("url", ""):
            return item["webSocketDebuggerUrl"]
    return None

def eval_js(expression):
    ws_url = get_page_ws_url()
    if not ws_url:
        print("Page ws url not found!")
        return None
    ws = websocket.create_connection(ws_url, timeout=10)
    req = {
        "id": 1,
        "method": "Runtime.evaluate",
        "params": {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True
        }
    }
    ws.send(json.dumps(req))
    while True:
        raw = ws.recv()
        msg = json.loads(raw)
        if msg.get("id") == 1:
            ws.close()
            return msg.get("result", {})

if __name__ == "__main__":
    expr = sys.argv[1] if len(sys.argv) > 1 else "document.title"
    res = eval_js(expr)
    print(json.dumps(res, indent=2))
