/**
 * Utilidades de validación para el microservicio de usuarios
 */

/**
 * Valida que una contraseña cumpla con los requisitos de seguridad
 * @param {string} password - La contraseña a validar
 * @returns {{ valid: boolean, error?: string }} - Resultado de la validación
 */
export function validateStrongPassword(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\/'`~]/.test(password);

    if (password.length < minLength) {
        return { 
            valid: false, 
            error: 'La contraseña debe tener al menos 8 caracteres.' 
        };
    }
    
    if (!hasUpperCase || !hasLowerCase) {
        return { 
            valid: false, 
            error: 'La contraseña debe contener mayúsculas y minúsculas.' 
        };
    }
    
    if (!hasNumbers) {
        return { 
            valid: false, 
            error: 'La contraseña debe contener al menos un número.' 
        };
    }
    
    if (!hasSpecialChar) {
        return { 
            valid: false, 
            error: 'La contraseña debe contener al menos un carácter especial (!@#$%^&*...).' 
        };
    }

    return { valid: true };
}

/**
 * Valida formato de email de forma más robusta
 * @param {string} email - El email a validar
 * @returns {{ valid: boolean, error?: string }} - Resultado de la validación
 */
export function validateEmail(email) {
    // RFC 5322 compliant regex (simplificado pero robusto)
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    if (!email || email.trim().length === 0) {
        return { 
            valid: false, 
            error: 'El email es requerido.' 
        };
    }
    
    if (email.length > 254) {
        return { 
            valid: false, 
            error: 'El email es demasiado largo.' 
        };
    }
    
    if (!emailRegex.test(email)) {
        return { 
            valid: false, 
            error: 'Formato de email inválido.' 
        };
    }
    
    return { valid: true };
}

/**
 * Sanitiza un nombre de usuario (elimina espacios extra, etc)
 * @param {string} nombre - El nombre a sanitizar
 * @returns {string} - Nombre sanitizado
 */
export function sanitizeName(nombre) {
    return nombre.trim().replace(/\s+/g, ' ');
}
