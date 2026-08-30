export const es = {
  common: {
    appName: "Wishlist",
    tagline: "Guarda lo que quieres y compártelo con quien quieras.",
    dismiss: "Cerrar",
    cancel: "Cancelar",
  },
  nav: {
    login: "Iniciar sesión",
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
    // Validation messages for the add/edit item form. Referenced by key from
    // `src/lib/schemas/item.ts` so the schema stays in English (T092).
    itemForm: {
      errors: {
        url: "Ingresa un enlace válido",
        title: "Ingresa un título",
        priceAmount: "Ingresa un monto válido",
        priceAmountPositive: "El monto debe ser mayor que cero",
        pricePair: "El precio y la moneda van juntos",
        wishlistIds: "Elige al menos una lista",
        atLeastOneField: "Cambia al menos un campo",
      },
    },
    addItemModal: {
      title: "Añadir artículo",
      url: "Enlace del producto",
      urlPlaceholder: "Pega el enlace aquí",
      itemTitle: "Título",
      notes: "Notas",
      price: "Precio",
      currency: "Moneda",
      lists: "¿En qué listas?",
      removeList: "Quitar",
      noListsFound: "No se encontraron listas.",
      submit: "Añadir",
      submitting: "Añadiendo…",
      errors: {
        generic: "No se pudo añadir el artículo. Intenta de nuevo.",
      },
    },
    itemImage: {
      label: "Imagen",
      // Shown when the scrape found nothing — some stores block us entirely.
      missing: "No pudimos obtener la imagen de esta tienda.",
      dropHint: "Arrastra una imagen, pégala con Ctrl+V, o toca para elegir una",
      dropHintShort: "Toca para elegir una imagen o pégala",
      chooseFile: "Elegir imagen",
      orPasteUrl: "O pega la dirección de la imagen",
      urlPlaceholder: "https://…/imagen.jpg",
      replace: "Cambiar imagen",
      remove: "Quitar imagen",
      uploading: "Subiendo imagen…",
      preview: "Vista previa de la imagen",
      errors: {
        unsupported: "Ese archivo no es una imagen que podamos usar.",
        tooLarge: "Esa imagen es demasiado grande.",
        uploadFailed: "No se pudo subir la imagen. El artículo sí se guardó.",
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
    createWishlist: "Nueva lista",
    createWishlistModal: {
      title: "Crear lista",
      titleLabel: "Nombre de la lista",
      submit: "Crear",
      submitting: "Creando…",
      errors: {
        generic: "No se pudo crear la lista. Intenta de nuevo.",
      },
    },
    renameWishlist: "Renombrar",
    renameWishlistModal: {
      title: "Renombrar lista",
      submit: "Guardar",
      submitting: "Guardando…",
      errors: {
        generic: "No se pudo renombrar la lista. Intenta de nuevo.",
      },
    },
    deleteWishlist: "Eliminar lista",
    deleteWishlistDialog: {
      title: "¿Eliminar esta lista?",
      description: "Se eliminará la lista \"{title}\". Esta acción no se puede deshacer.",
      confirm: "Eliminar",
      orphansWarning:
        "Estos artículos no están en ninguna otra lista — eliminar la lista también los eliminará a ellos:",
      confirmOrphans: "Eliminar de todos modos",
      errors: {
        generic: "No se pudo eliminar la lista. Intenta de nuevo.",
      },
    },
    filterLabel: "Tus listas",
    share: "Compartir",
    shareCopied: "Enlace copiado",
    shareErrors: {
      generic: "No se pudo compartir el enlace. Intenta de nuevo.",
    },
    shareMetaTitle: "{name} — {title}",
    itemsCountOne: "1 artículo",
    itemsCount: "{n} artículos",
  },
  invite: {
    trigger: "Invitar",
    title: "Invitar a alguien",
    description: "Genera un código de invitación de un solo uso, válido por 7 días.",
    generate: "Generar código",
    generating: "Generando…",
    copy: "Copiar código",
    copied: "Código copiado",
    copyFailed: "No se pudo copiar el código.",
    expiresOn: "Válido hasta el {date}",
  },
} as const;
