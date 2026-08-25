.DEFAULT_GOAL := help

.PHONY: help install install-ruby install-node install-browser build serve test test-unit test-js-unit test-browser verify-skills validate validate-production-assets validate-public-claims validate-route-content validate-services validate-service-studios validate-solutions validate-cinematic-solutions validate-smart-home validate-cinematic-system validate-physical-scene-states validate-cinematic-route-transitions validate-quality-policy html check clean

help: ## Показати доступні команди
	@awk 'BEGIN {FS = ":.*## "; printf "Smart Electrics\n\n"} /^[a-zA-Z_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: install-ruby install-node install-browser ## Встановити всі локальні залежності

install-ruby: ## Встановити Ruby gems із lockfile
	bundle config set --local path vendor/bundle
	bundle install

install-node: ## Встановити npm-залежності з lockfile
	npm ci

install-browser: ## Встановити Chromium для Playwright
	npx playwright install chromium

build: validate ## Зібрати статичний сайт у _site
	JEKYLL_ENV=production bundle exec jekyll build --trace

serve: ## Запустити локальний Jekyll-сервер
	bundle exec jekyll serve --livereload

test: test-unit test-browser ## Запустити всі тести

test-unit: ## Перевірити guard інтеграцій
	bundle exec ruby -Itest tests/unit/integration_config_test.rb
	bundle exec ruby -Itest tests/unit/service_contract_test.rb
	bundle exec ruby -Itest tests/unit/solution_contract_test.rb
	bundle exec ruby -Itest tests/unit/cinematic_solutions_contract_test.rb
	bundle exec ruby -Itest tests/unit/smart_home_contract_test.rb
	bundle exec ruby -Itest tests/unit/cinematic_contract_test.rb
	bundle exec ruby -Itest tests/unit/physical_scene_contract_test.rb
	bundle exec ruby -Itest tests/unit/service_studio_contract_test.rb
	bundle exec ruby -Itest tests/unit/route_content_contract_test.rb
	bundle exec ruby -Itest tests/unit/cinematic_route_transition_contract_test.rb
	bundle exec ruby -Itest tests/unit/production_assets_contract_test.rb
	bundle exec ruby -Itest tests/unit/public_claims_contract_test.rb
	$(MAKE) test-js-unit

test-js-unit: ## Перевірити pure state contracts
	npm run test:unit

test-browser: ## Перевірити маршрути, responsive UI та a11y у Chromium
	npm test

verify-skills: ## Перевірити склад і контрольні суми project-local skills
	bundle exec ruby scripts/verify_agent_skills.rb

validate: ## Перевірити, що зовнішні інтеграції безпечно вимкнені або повністю налаштовані
	bundle exec ruby scripts/validate_integrations.rb

validate-production-assets: ## Перевірити production WebP inventory, provenance і responsive-пари
	bundle exec ruby scripts/validate_production_assets.rb

validate-public-claims: build ## Перевірити source і зібрану видиму публічну копію
	bundle exec ruby scripts/validate_public_claims.rb

validate-route-content: ## Перевірити локалізований контракт маршрутів і truthful copy
	bundle exec ruby scripts/validate_route_content.rb

validate-services: ## Перевірити контракт collection послуг
	bundle exec ruby scripts/validate_services.rb

validate-service-studios: ## Перевірити контракт кінематографічних studio сторінок
	bundle exec ruby scripts/validate_service_studios.rb

validate-solutions: ## Перевірити контракт collection готових рішень
	bundle exec ruby scripts/validate_solutions.rb

validate-cinematic-solutions: ## Перевірити центральний контракт кінематографічного атласу рішень
	bundle exec ruby scripts/validate_cinematic_solutions.rb

validate-smart-home: ## Перевірити контракт даних симулятора розумного будинку
	bundle exec ruby scripts/validate_smart_home.rb

validate-cinematic-system: ## Перевірити канонічний кінематографічний граф
	bundle exec ruby scripts/validate_cinematic_system.rb

validate-physical-scene-states: ## Перевірити медіамапу фізичних станів резиденції
	bundle exec ruby scripts/validate_physical_scene_states.rb

validate-cinematic-route-transitions: ## Перевірити fail-closed контракт переходів між маршрутами
	bundle exec ruby scripts/validate_cinematic_route_transitions.rb

validate-quality-policy: ## Перевірити fail-closed налаштування тестів
	npm run validate:quality-policy

html: validate-public-claims ## Перевірити згенерований HTML і внутрішні посилання
	bundle exec htmlproofer ./_site --disable-external --no-enforce-https

check: verify-skills test-unit validate-quality-policy validate-production-assets validate-public-claims validate-route-content validate-services validate-service-studios validate-solutions validate-cinematic-solutions validate-smart-home validate-cinematic-system validate-physical-scene-states validate-cinematic-route-transitions html test-browser ## Повний локальний quality gate

clean: ## Прибрати лише згенеровані артефакти Jekyll
	bundle exec jekyll clean
