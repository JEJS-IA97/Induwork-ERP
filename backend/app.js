/**
 * Entry point para cPanel / CloudLinux Passenger
 *
 * Los servidores cPanel con Node.js Selector esperan un script de arranque
 * en la raíz de la aplicación (usualmente app.js o server.js).
 * Este archivo delega la ejecución al bundle compilado de NestJS en dist/src/main.
 */
require('./dist/src/main');
