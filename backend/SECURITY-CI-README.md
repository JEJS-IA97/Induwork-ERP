Seguridad automatizada del repositorio

Este repositorio incorpora controles automatizados básicos para reducir el riesgo de introducir vulnerabilidades durante el ciclo de desarrollo.

Controles

CI: instala dependencias desde el lockfile, genera Prisma, compila el backend y ejecuta las pruebas unitarias.

Security: ejecuta CodeQL, Gitleaks, npm audit y revisión de dependencias en pull requests.

Dependabot: revisa semanalmente dependencias npm y GitHub Actions.

Requisitos para hacerlos exigibles

Los checks deben convertirse en checks obligatorios de la rama master mediante las reglas de protección del repositorio. Los workflows, por sí solos, no garantizan que una fusión quede bloqueada.

No se configuran credenciales de aplicación, bases de datos de producción ni secretos dentro de estos workflows.