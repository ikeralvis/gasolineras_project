import bcrypt from 'bcryptjs';
import { sanitizeName, validateEmail, validateStrongPassword } from '../utils/validators.js';

const SALT_ROUNDS = 10;

function mapFuelToPreferredPrice(fuelType) {
  switch (fuelType) {
    case 'gasolina':
      return 'Precio Gasolina 95 E5';
    case 'diesel':
      return 'Precio Gasoleo A';
    case 'hibrido':
      return 'Precio Gasolina 95 E5';
    default:
      return null;
  }
}

async function applyEmailUpdate(userRepository, userId, body, updates) {
  if (!body.email) return null;

  const emailValidation = validateEmail(body.email);
  if (!emailValidation.valid) {
    return { ok: false, statusCode: 400, error: emailValidation.error };
  }

  const normalizedEmail = body.email.toLowerCase();
  const inUse = await userRepository.emailInUseByOtherUser(normalizedEmail, userId);
  if (inUse) {
    return { ok: false, statusCode: 409, error: 'El email ya está en uso.' };
  }

  updates.email = normalizedEmail;
  return null;
}

async function applyPasswordUpdate(body, updates) {
  if (!body.password) return null;

  const passwordValidation = validateStrongPassword(body.password);
  if (!passwordValidation.valid) {
    return { ok: false, statusCode: 400, error: passwordValidation.error };
  }

  updates.password_hash = await bcrypt.hash(body.password, SALT_ROUNDS);
  return null;
}

function applyVehicleAndFuelUpdates(body, updates) {
  if (body.combustible_favorito) {
    updates.combustible_favorito = body.combustible_favorito;
  }

  if (body.modelo_coche) {
    updates.modelo_coche = body.modelo_coche.trim();
  }

  if (body.tipo_combustible_coche) {
    updates.tipo_combustible_coche = body.tipo_combustible_coche;
    if (!body.combustible_favorito) {
      updates.combustible_favorito = mapFuelToPreferredPrice(body.tipo_combustible_coche);
    }
  }
}

export class UserService {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async getMe(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return { ok: false, statusCode: 404, error: 'Usuario no encontrado' };
    }
    return { ok: true, statusCode: 200, data: user };
  }

  async updateMe(userId, body) {
    const updates = {};

    if (body.nombre) {
      updates.nombre = sanitizeName(body.nombre);
    }

    const emailError = await applyEmailUpdate(this.userRepository, userId, body, updates);
    if (emailError) return emailError;

    const passwordError = await applyPasswordUpdate(body, updates);
    if (passwordError) return passwordError;

    applyVehicleAndFuelUpdates(body, updates);

    if (Object.keys(updates).length === 0) {
      return { ok: false, statusCode: 400, error: 'No hay campos para actualizar.' };
    }

    const updated = await this.userRepository.updateById(userId, updates);
    if (!updated) {
      return { ok: false, statusCode: 404, error: 'Usuario no encontrado.' };
    }

    return { ok: true, statusCode: 200, data: updated };
  }

  async deleteMe(userId) {
    const deleted = await this.userRepository.deleteById(userId);
    if (!deleted) {
      return { ok: false, statusCode: 404, error: 'Usuario no encontrado.' };
    }
    return { ok: true, statusCode: 200, data: { message: 'Cuenta eliminada correctamente.' } };
  }

  async listUsers() {
    const users = await this.userRepository.listUsers();
    return { ok: true, statusCode: 200, data: users };
  }
}
