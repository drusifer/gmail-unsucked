# GmailUnSucked build automation. Run via `bobp make <target>`.
SHELL := /bin/bash
SRC := $(filter-out $(wildcard test/*),$(wildcard *.js))
TESTS := $(wildcard test/*.test.js)

.PHONY: help lint typecheck test check status push deploy pull live-test

help: ## List targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | sed 's/:.*##/ -/'

lint: ## Syntax-check all source files (node --check)
	@for f in $(SRC) $(wildcard test/*.js); do node --check "$$f" || exit 1; done; \
	echo "lint ok: $(words $(SRC) $(wildcard test/*.js)) file(s)"

test: ## Run unit tests (node --test)
	@if [ -z "$(TESTS)" ]; then echo "no tests yet (test/*.test.js)"; else node --test $(TESTS); fi

typecheck: ## Type-check against @types/google-apps-script (npm install first)
	@if [ ! -d node_modules ]; then npm install --no-audit --no-fund >/dev/null; fi; \
	npx tsc -p tsconfig.json && echo "typecheck ok"

check: lint typecheck test ## Gate: lint + typecheck + test (used by push/deploy and CI)

status: ## Show files clasp would push
	clasp status

push: check ## Gate, then clasp push to the Apps Script project
	clasp push

deploy: push ## Push, then create a new Apps Script deployment version
	clasp deploy --description "$$(date -u +%Y-%m-%dT%H:%MZ) via make deploy"

live-test: push ## Real-runtime self-test (layer 4): push, then `clasp run selfTest` (needs API-executable deployment, see docs/ARCH.md section 5)
	clasp run selfTest

pull: ## Pull remote script (careful: overwrites local)
	clasp pull
