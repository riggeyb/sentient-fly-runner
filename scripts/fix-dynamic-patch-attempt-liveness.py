from pathlib import Path
p = Path("/tmp/dynamic-core-patch.py")
s = p.read_text()
if "const attemptStarted = this.#now();" in s:
    raise SystemExit("attempt liveness fix already present")
append = '\nreplace("src/model/providers/atlas-hybrid-router.ts",\n\'\'\'        const result = await this.#atlas.complete({\'\'\',\n\'\'\'        const attemptStarted = this.#now();\n        const result = await this.#atlas.complete({\'\'\')\nreplace("src/model/providers/atlas-hybrid-router.ts",\n\'\'\'        if (input.signal?.aborted || this.#now() - started >= overall) {\'\'\',\n\'\'\'        if (\n          input.signal?.aborted\n          || this.#now() - attemptStarted >= attemptTimeout\n          || this.#now() - started >= overall\n        ) {\'\'\')\n'
p.write_text(s + append)
