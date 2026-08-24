export const es = {
  common: {
    appName: "Wishlist",
    tagline: "Guarda lo que quieres y compártelo con quien quieras.",
  },
  theme: {
    light: "claro",
    dark: "oscuro",
    switchTo: "Cambiar a modo {mode}",
  },
  auth: {
    login: {
      title: "Iniciar sesión",
      email: "Correo electrónico",
      password: "Contraseña",
      submit: "Iniciar sesión",
      submitting: "Iniciando sesión…",
      noAccount: "¿No tienes cuenta?",
      registerLink: "Regístrate",
      errors: {
        invalidCredentials: "Correo o contraseña incorrectos",
      },
    },
    register: {
      title: "Crear cuenta",
      displayName: "Nombre",
      email: "Correo electrónico",
      password: "Contraseña",
      inviteCode: "Código de invitación",
      submit: "Crear cuenta",
      submitting: "Creando cuenta…",
      haveAccount: "¿Ya tienes cuenta?",
      loginLink: "Inicia sesión",
      errors: {
        emailTaken: "Ya existe una cuenta con ese correo",
        inviteAlreadyUsed: "Ese código de invitación ya fue usado",
        invalidInviteCode: "Ese código de invitación no es válido o venció",
      },
    },
  },
  errors: {
    generic: "Algo salió mal. Intenta de nuevo.",
    rateLimited: "Demasiados intentos. Intenta de nuevo en {seconds} segundos.",
  },
  wishlist: {
    noImage: "Sin imagen",
    empty: "Todavía no hay artículos en esta lista.",
    byOwner: "Lista de {name}",
    claimed: "Reservado",
  },
} as const;
