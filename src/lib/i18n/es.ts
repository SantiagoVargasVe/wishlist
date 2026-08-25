export const es = {
  common: {
    appName: "Wishlist",
    tagline: "Guarda lo que quieres y compártelo con quien quieras.",
    dismiss: "Cerrar",
    cancel: "Cancelar",
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
    markBought: "Marcar como comprado",
    undo: "Deshacer",
    claimErrors: {
      alreadyClaimed: "Alguien más ya reservó este artículo",
      generic: "No se pudo reservar. Intenta de nuevo.",
    },
    undoErrors: {
      generic: "No se pudo deshacer la reserva. Intenta de nuevo.",
    },
    addItem: "Añadir artículo",
    addItemModal: {
      title: "Añadir artículo",
      url: "Enlace del producto",
      urlPlaceholder: "Pega el enlace aquí",
      itemTitle: "Título",
      notes: "Notas",
      price: "Precio",
      currency: "Moneda",
      lists: "¿En qué listas?",
      submit: "Añadir",
      submitting: "Añadiendo…",
      errors: {
        generic: "No se pudo añadir el artículo. Intenta de nuevo.",
      },
    },
    editItem: "Editar",
    editItemModal: {
      title: "Editar artículo",
      submit: "Guardar",
      submitting: "Guardando…",
      priceHint: "Déjalo vacío para no cambiar el precio.",
      errors: {
        generic: "No se pudo guardar los cambios. Intenta de nuevo.",
      },
    },
    removeItem: "Quitar",
    removeErrors: {
      generic: "No se pudo quitar el artículo. Intenta de nuevo.",
    },
    removeLastListDialog: {
      title: "¿Quitar este artículo?",
      description:
        "Esta es la única lista donde está este artículo — quitarlo lo eliminará por completo.",
      confirm: "Quitar de todos modos",
    },
    deleteItem: "Eliminar",
    deleteItemDialog: {
      title: "¿Eliminar este artículo?",
      description: "Se eliminará \"{title}\" de todas tus listas. Esta acción no se puede deshacer.",
      confirm: "Eliminar",
      errors: {
        generic: "No se pudo eliminar el artículo. Intenta de nuevo.",
      },
    },
  },
} as const;
