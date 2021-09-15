default: help

PATCH = applyHarness.patch
CONTRACTS_DIR = ../contracts
MUNGED_DIR    = munged

help:
	@echo "usage:"
	@echo "  make clean:  remove all generated files (those ignored by git)"
	@echo "  make $(MUNGED_DIR): create $(MUNGED_DIR) directory by applying the patch file to $(CONTRACTS_DIR)"
	@echo "  make record: record a new patch file capturing the differences between $(CONTRACTS_DIR) and $(MUNGED_DIR)"

output.csv: output.json
	cat $< | jq '.rules | to_entries | .[] | if .value | type == "string" then ["", "", .key, "", .value] else . as $$orig | .value | paths(scalars) as $$path | ["", "", $$orig.key, getpath($$path), $$path[0]] end | @csv' -r > $@

output.json: dump.tar.gz
	tar -xOzf $< TarName/Reports/output.json > $@

munged: munged/stamp

munged/stamp:  $(wildcard $(CONTRACTS)/*/*.sol) $(PATCH)
	rm -rf munged
	cp -r $(CONTRACTS_DIR) munged
	patch -p0 -d munged < $(PATCH)
	touch $@

record:
	diff -x "munged/stamp" -x "*.orig" -x "*.rej" -ruN $(CONTRACTS_DIR) $(MUNGED_DIR) | sed 's+../contracts/++g' | sed 's+munged/++g' > $(PATCH)

clean:
	git clean -fdX
	touch $(PATCH)

.PHONY: munged help default clean record
