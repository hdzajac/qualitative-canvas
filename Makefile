# Convenience targets for running with prebuilt images or local builds

.PHONY: help pull-images up-images down-images up down logs

help:
	@echo "Targets:"
	@echo "  pull-images   - Pull prebuilt images from registry"
	@echo "  up-images     - Start stack using prebuilt images (no build)"
	@echo "  down-images   - Stop stack started with prebuilt images"
	@echo "  up            - Start stack with local build (compose build)"
	@echo "  down          - Stop stack and remove containers"
	@echo "  logs          - Tail logs for all services (Ctrl+C to stop)"

pull-images:
	./scripts/pull-images.sh

up-images:
	docker compose -f docker-compose.yml -f docker-compose.images.yml up -d

down-images:
	docker compose -f docker-compose.yml -f docker-compose.images.yml down

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f
