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

export class AuthService {
  constructor({ userRepository, jwt, jwtExpiresIn }) {
    this.userRepository = userRepository;
    this.jwt = jwt;
    this.jwtExpiresIn = jwtExpiresIn;
  }

  async register({ nombre, email, password, modelo_coche, tipo_combustible_coche }) {
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return { ok: false, statusCode: 400, error: emailValidation.error };
    }

    const passwordValidation = validateStrongPassword(password);
    if (!passwordValidation.valid) {
      return { ok: false, statusCode: 400, error: passwordValidation.error };
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const combustibleFavorito = mapFuelToPreferredPrice(tipo_combustible_coche);

    try {
      const created = await this.userRepository.create({
        nombre: sanitizeName(nombre),
        email: email.toLowerCase(),
        passwordHash,
        modeloCoche: modelo_coche?.trim() || null,
        tipoCombustibleCoche: tipo_combustible_coche || null,
        combustibleFavorito,
      });

      if (!created) {
        return { ok: false, statusCode: 500, error: 'Fallo al registrar el usuario' };
      }

      return { ok: true, statusCode: 201, data: created };
    } catch (error) {
      if (error.code === '23505') {
        return { ok: false, statusCode: 409, error: 'El email ya está registrado.' };
      }
      throw error;
    }
  }

  async login({ email, password }) {
    const user = await this.userRepository.findByEmail(email.toLowerCase());
    if (!user) {
      return { ok: false, statusCode: 401, error: 'Credenciales inválidas.' };
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return { ok: false, statusCode: 401, error: 'Credenciales inválidas.' };
    }

    const token = this.jwt.sign(
      { id: user.id, email: user.email, is_admin: user.is_admin, nombre: user.nombre },
      { expiresIn: this.jwtExpiresIn }
    );

    return { ok: true, statusCode: 200, data: { token } };
  }

  async loginOrCreateGoogle({ google_id, email, name }) {
    const normalizedEmail = email.toLowerCase();
    let user = await this.userRepository.findByEmail(normalizedEmail);

    if (user) {
      if (!user.google_id) {
        await this.userRepository.setGoogleId(user.id, google_id);
      }
    } else {
      const randomPasswordHash = await bcrypt.hash(Math.random().toString(36), SALT_ROUNDS);
      user = await this.userRepository.createGoogleUser({
        nombre: sanitizeName(name),
        email: normalizedEmail,
        passwordHash: randomPasswordHash,
        googleId: google_id,
      });
    }

    const token = this.jwt.sign(
      { id: user.id, email: user.email, is_admin: user.is_admin, nombre: user.nombre },
      { expiresIn: this.jwtExpiresIn }
    );

    return { ok: true, statusCode: 200, data: { token } };
  }
}
