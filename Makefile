# Makefile — CipherFlow inbox-ia-pro
# Usage : make test

.PHONY: test test-e2e test-unit lint

# Lance tous les tests (unit + e2e pipeline)
test:
	cd backend && python -m pytest tests/ -v --tb=short

# Tests e2e pipeline uniquement
test-e2e:
	cd backend && python -m pytest tests/test_pipeline_e2e.py -v

# Tests unitaires (hors e2e)
test-unit:
	cd backend && python -m pytest tests/ -v --ignore=tests/test_pipeline_e2e.py --tb=short

# Lint rapide
lint:
	cd backend && python -m flake8 app/ --max-line-length=120 --exclude=__pycache__
