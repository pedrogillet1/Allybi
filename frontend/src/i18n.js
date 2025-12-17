import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Translation resources
const resources = {
  en: {
    translation: {
      // Navigation
      nav: {
        chat: 'Chat',
        documents: 'Documents',
        upload: 'Upload',
        settings: 'Settings',
        dashboard: 'Dashboard',
        logout: 'Logout'
      },
      // Common actions
      common: {
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        edit: 'Edit',
        search: 'Search',
        upload: 'Upload',
        download: 'Download',
        rename: 'Rename',
        move: 'Move',
        copy: 'Copy',
        select: 'Select',
        selectAll: 'Select All',
        deselectAll: 'Deselect All',
        loading: 'Loading...',
        noResults: 'No results found',
        confirm: 'Confirm',
        close: 'Close',
        retry: 'Retry',
        files: 'Files',
        file: 'File',
        folder: 'Folder',
        folders: 'Folders',
        total: 'Total'
      },
      // Chat interface
      chat: {
        placeholder: 'Ask anything about your documents...',
        send: 'Send',
        newChat: 'New Chat',
        regenerate: 'Regenerate',
        copyResponse: 'Copy Response',
        researchMode: 'Research Mode',
        greeting: 'Hello',
        welcomeMessage: 'How can I help you today?'
      },
      // Documents
      documents: {
        title: 'Documents',
        allDocuments: 'All Documents',
        recentDocuments: 'Recent Documents',
        uploadDocuments: 'Upload Documents',
        noDocuments: 'No documents yet',
        dragDrop: 'Drag and drop files here',
        orBrowse: 'or browse files',
        fileTypes: 'All file types supported',
        maxSize: 'Max file size: 15MB',
        sortBy: 'Sort by',
        name: 'Name',
        date: 'Date',
        size: 'Size',
        type: 'Type',
        category: 'Category',
        categories: 'Categories',
        uncategorized: 'Uncategorized'
      },
      // Upload
      upload: {
        title: 'Upload Documents',
        uploading: 'Uploading...',
        uploadComplete: 'Upload complete',
        uploadFailed: 'Upload failed',
        dragDropHere: 'Upload Documents or Drag-n-drop',
        selectFiles: 'Select Files',
        progress: 'Progress',
        success: '{{count}} document{{plural}} been uploaded.',
        error: 'Upload failed. Please try again.'
      },
      // Settings
      settings: {
        title: 'Settings',
        account: 'Account',
        profile: 'Profile',
        security: 'Security',
        notifications: 'Notifications',
        language: 'Language',
        theme: 'Theme',
        storage: 'Storage',
        storageUsed: 'Storage Used',
        plan: 'Plan',
        upgrade: 'Upgrade',
        changePassword: 'Change Password',
        deleteAccount: 'Delete Account',
        languageRegion: 'Language & Region',
        interfaceLanguage: 'Interface Language',
        answerLanguage: 'Answer Language'
      },
      // Notifications
      notifications: {
        title: 'Notifications',
        noNotifications: 'No notifications',
        markAllRead: 'Mark all as read',
        uploadSuccess: 'Document uploaded successfully',
        uploadError: 'Failed to upload document',
        deleteSuccess: 'Document deleted',
        moveSuccess: 'Document moved'
      },
      // Toast messages
      toast: {
        uploadSuccess: '{{count}} document(s) uploaded successfully',
        uploadFailed: 'Upload failed',
        deleteSuccess: '{{count}} item(s) deleted',
        rateLimitWarning: 'Slow down! Too many requests.',
        rateLimitDetails: 'Please wait a few seconds before trying again.',
        fileAlreadyExists: 'Duplicate file skipped',
        fileAlreadyExistsDetails: '"{{filename}}" has already been uploaded',
        filesAlreadyExist: '{{count}} duplicate file(s) skipped'
      },
      // Errors
      errors: {
        generic: 'Something went wrong',
        network: 'Network error. Please check your connection.',
        unauthorized: 'Please log in to continue',
        notFound: 'Not found',
        fileTooLarge: 'File is too large',
        invalidFileType: 'Invalid file type'
      },
      // Auth
      auth: {
        login: 'Log In',
        signup: 'Sign Up',
        logout: 'Log Out',
        email: 'Email',
        password: 'Password',
        confirmPassword: 'Confirm Password',
        forgotPassword: 'Forgot Password?',
        createAccount: 'Create Account',
        alreadyHaveAccount: 'Already have an account?',
        dontHaveAccount: "Don't have an account?"
      },
      // File breakdown
      fileBreakdown: {
        title: 'File Breakdown',
        video: 'Video',
        document: 'Document',
        spreadsheet: 'Spreadsheet',
        image: 'Image',
        other: 'Other'
      },
      // Welcome popup
      welcome: {
        title: "Join Koda's Universe",
        description: 'Sign up to unlock the full power of intelligent document management',
        cta: 'Sign Up Now'
      },
      // Onboarding
      onboarding: {
        step: 'STEP {{current}} OF {{total}}',
        skip: 'Skip introduction',
        back: 'Back',
        next: 'Next',
        start: 'Start using Koda',
        // Slide 1
        slide1: {
          title: "Organizing documents isn't your job. It's mine.",
          subtitle: 'I store your contracts, reports, spreadsheets and drawings. You just ask — I find the right answer.',
          bullet1: 'Upload your contracts, pitchbooks, spreadsheets and CAD drawings once',
          bullet1Sub: '(DOCX, PDF, XLSX, PPTX, DWG…).',
          bullet2: 'Ask me like you would ask a colleague — in natural language.',
          bullet3: 'I find clauses, numbers and passages across all your files in seconds.'
        },
        // Slide 2
        slide2: {
          title: 'See your work organized into Categories.',
          subtitle: 'I group your files by clients, projects and themes — so everything lives in one place.',
          bullet1: 'Create Categories like "Clients – Contracts" or "Engineering Projects – Line 4".',
          bullet2: 'See what came in last under "Recently added".',
          bullet3: 'Click any line to open the file and ask me about it.'
        },
        // Slide 3
        slide3: {
          title: 'Send your files and ask your first question.',
          subtitle: 'Next time you need a number, clause or plan, just ask me here.',
          bullet1: 'Use the text bar to ask anything about your files.',
          bullet2: 'Click the paperclip to upload new documents.',
          bullet3: 'Speak naturally — you don't need special commands.'
        },
        // Settings card
        settingsCard: {
          title: 'Introduction to Koda',
          description: 'Replay the welcome tour and learn how to use Koda.'
        }
      }
    }
  },
  'pt-BR': {
    translation: {
      // Navigation
      nav: {
        chat: 'Chat',
        documents: 'Documentos',
        upload: 'Enviar',
        settings: 'Configurações',
        dashboard: 'Painel',
        logout: 'Sair'
      },
      // Common actions
      common: {
        save: 'Salvar',
        cancel: 'Cancelar',
        delete: 'Excluir',
        edit: 'Editar',
        search: 'Pesquisar',
        upload: 'Enviar',
        download: 'Baixar',
        rename: 'Renomear',
        move: 'Mover',
        copy: 'Copiar',
        select: 'Selecionar',
        selectAll: 'Selecionar Tudo',
        deselectAll: 'Desmarcar Tudo',
        loading: 'Carregando...',
        noResults: 'Nenhum resultado encontrado',
        confirm: 'Confirmar',
        close: 'Fechar',
        retry: 'Tentar Novamente',
        files: 'Arquivos',
        file: 'Arquivo',
        folder: 'Pasta',
        folders: 'Pastas',
        total: 'Total'
      },
      // Chat interface
      chat: {
        placeholder: 'Pergunte qualquer coisa sobre seus documentos...',
        send: 'Enviar',
        newChat: 'Novo Chat',
        regenerate: 'Regenerar',
        copyResponse: 'Copiar Resposta',
        researchMode: 'Modo Pesquisa',
        greeting: 'Olá',
        welcomeMessage: 'Como posso ajudá-lo hoje?'
      },
      // Documents
      documents: {
        title: 'Documentos',
        allDocuments: 'Todos os Documentos',
        recentDocuments: 'Documentos Recentes',
        uploadDocuments: 'Enviar Documentos',
        noDocuments: 'Nenhum documento ainda',
        dragDrop: 'Arraste e solte arquivos aqui',
        orBrowse: 'ou navegue nos arquivos',
        fileTypes: 'Todos os tipos de arquivo suportados',
        maxSize: 'Tamanho máximo: 15MB',
        sortBy: 'Ordenar por',
        name: 'Nome',
        date: 'Data',
        size: 'Tamanho',
        type: 'Tipo',
        category: 'Categoria',
        categories: 'Categorias',
        uncategorized: 'Sem categoria'
      },
      // Upload
      upload: {
        title: 'Enviar Documentos',
        uploading: 'Enviando...',
        uploadComplete: 'Envio concluído',
        uploadFailed: 'Falha no envio',
        dragDropHere: 'Envie Documentos ou Arraste e Solte',
        selectFiles: 'Selecionar Arquivos',
        progress: 'Progresso',
        success: '{{count}} documento{{plural}} enviado{{plural}}.',
        error: 'Falha no envio. Por favor, tente novamente.'
      },
      // Settings
      settings: {
        title: 'Configurações',
        account: 'Conta',
        profile: 'Perfil',
        security: 'Segurança',
        notifications: 'Notificações',
        language: 'Idioma',
        theme: 'Tema',
        storage: 'Armazenamento',
        storageUsed: 'Armazenamento Usado',
        plan: 'Plano',
        upgrade: 'Atualizar',
        changePassword: 'Alterar Senha',
        deleteAccount: 'Excluir Conta',
        languageRegion: 'Idioma e Região',
        interfaceLanguage: 'Idioma da Interface',
        answerLanguage: 'Idioma das Respostas'
      },
      // Notifications
      notifications: {
        title: 'Notificações',
        noNotifications: 'Sem notificações',
        markAllRead: 'Marcar tudo como lido',
        uploadSuccess: 'Documento enviado com sucesso',
        uploadError: 'Falha ao enviar documento',
        deleteSuccess: 'Documento excluído',
        moveSuccess: 'Documento movido'
      },
      // Toast messages
      toast: {
        uploadSuccess: '{{count}} documento(s) enviado(s) com sucesso',
        uploadFailed: 'Falha no envio',
        deleteSuccess: '{{count}} item(s) excluído(s)',
        rateLimitWarning: 'Devagar! Muitas requisições.',
        rateLimitDetails: 'Por favor, aguarde alguns segundos antes de tentar novamente.',
        fileAlreadyExists: 'Arquivo duplicado ignorado',
        fileAlreadyExistsDetails: '"{{filename}}" já foi enviado',
        filesAlreadyExist: '{{count}} arquivo(s) duplicado(s) ignorado(s)'
      },
      // Errors
      errors: {
        generic: 'Algo deu errado',
        network: 'Erro de rede. Verifique sua conexão.',
        unauthorized: 'Por favor, faça login para continuar',
        notFound: 'Não encontrado',
        fileTooLarge: 'Arquivo muito grande',
        invalidFileType: 'Tipo de arquivo inválido'
      },
      // Auth
      auth: {
        login: 'Entrar',
        signup: 'Cadastrar',
        logout: 'Sair',
        email: 'E-mail',
        password: 'Senha',
        confirmPassword: 'Confirmar Senha',
        forgotPassword: 'Esqueceu a senha?',
        createAccount: 'Criar Conta',
        alreadyHaveAccount: 'Já tem uma conta?',
        dontHaveAccount: 'Não tem uma conta?'
      },
      // File breakdown
      fileBreakdown: {
        title: 'Análise de Arquivos',
        video: 'Vídeo',
        document: 'Documento',
        spreadsheet: 'Planilha',
        image: 'Imagem',
        other: 'Outro'
      },
      // Welcome popup
      welcome: {
        title: 'Junte-se ao Universo Koda',
        description: 'Cadastre-se para desbloquear todo o poder do gerenciamento inteligente de documentos',
        cta: 'Cadastre-se Agora'
      },
      // Onboarding
      onboarding: {
        step: 'ETAPA {{current}} DE {{total}}',
        skip: 'Pular introdução',
        back: 'Voltar',
        next: 'Próximo',
        start: 'Começar a usar Koda',
        // Slide 1
        slide1: {
          title: 'Organizar documentos não é seu trabalho. É meu.',
          subtitle: 'Eu guardo seus contratos, relatórios, planilhas e desenhos. Você apenas pergunta — eu encontro a resposta certa.',
          bullet1: 'Envie seus contratos, pitchbooks, planilhas e desenhos CAD uma vez',
          bullet1Sub: '(DOCX, PDF, XLSX, PPTX, DWG…).',
          bullet2: 'Pergunte como você perguntaria a um colega — em linguagem natural.',
          bullet3: 'Eu encontro cláusulas, números e passagens em todos os seus arquivos em segundos.'
        },
        // Slide 2
        slide2: {
          title: 'Veja seu trabalho organizado em Categorias.',
          subtitle: 'Eu agrupo seus arquivos por clientes, projetos e temas — para que tudo fique em um só lugar.',
          bullet1: 'Crie Categorias como "Clientes – Contratos" ou "Projetos de Engenharia – Linha 4".',
          bullet2: 'Veja o que chegou por último em "Adicionados recentemente".',
          bullet3: 'Clique em qualquer linha para abrir o arquivo e me perguntar sobre ele.'
        },
        // Slide 3
        slide3: {
          title: 'Envie seus arquivos e faça sua primeira pergunta.',
          subtitle: 'Da próxima vez que precisar de um número, cláusula ou plano, basta me perguntar aqui.',
          bullet1: 'Use a barra de texto para perguntar qualquer coisa sobre seus arquivos.',
          bullet2: 'Clique no clipe de papel para enviar novos documentos.',
          bullet3: 'Fale naturalmente — você não precisa de comandos especiais.'
        },
        // Settings card
        settingsCard: {
          title: 'Introdução ao Koda',
          description: 'Repita o tour de boas-vindas e aprenda como usar o Koda.'
        }
      }
    }
  },
  'es-ES': {
    translation: {
      // Navigation
      nav: {
        chat: 'Chat',
        documents: 'Documentos',
        upload: 'Subir',
        settings: 'Configuración',
        dashboard: 'Panel',
        logout: 'Cerrar Sesión'
      },
      // Common actions
      common: {
        save: 'Guardar',
        cancel: 'Cancelar',
        delete: 'Eliminar',
        edit: 'Editar',
        search: 'Buscar',
        upload: 'Subir',
        download: 'Descargar',
        rename: 'Renombrar',
        move: 'Mover',
        copy: 'Copiar',
        select: 'Seleccionar',
        selectAll: 'Seleccionar Todo',
        deselectAll: 'Deseleccionar Todo',
        loading: 'Cargando...',
        noResults: 'No se encontraron resultados',
        confirm: 'Confirmar',
        close: 'Cerrar',
        retry: 'Reintentar',
        files: 'Archivos',
        file: 'Archivo',
        folder: 'Carpeta',
        folders: 'Carpetas',
        total: 'Total'
      },
      // Chat interface
      chat: {
        placeholder: 'Pregunta cualquier cosa sobre tus documentos...',
        send: 'Enviar',
        newChat: 'Nuevo Chat',
        regenerate: 'Regenerar',
        copyResponse: 'Copiar Respuesta',
        researchMode: 'Modo Investigación',
        greeting: 'Hola',
        welcomeMessage: '¿Cómo puedo ayudarte hoy?'
      },
      // Documents
      documents: {
        title: 'Documentos',
        allDocuments: 'Todos los Documentos',
        recentDocuments: 'Documentos Recientes',
        uploadDocuments: 'Subir Documentos',
        noDocuments: 'Aún no hay documentos',
        dragDrop: 'Arrastra y suelta archivos aquí',
        orBrowse: 'o navega por archivos',
        fileTypes: 'Todos los tipos de archivo soportados',
        maxSize: 'Tamaño máximo: 15MB',
        sortBy: 'Ordenar por',
        name: 'Nombre',
        date: 'Fecha',
        size: 'Tamaño',
        type: 'Tipo',
        category: 'Categoría',
        categories: 'Categorías',
        uncategorized: 'Sin categoría'
      },
      // Upload
      upload: {
        title: 'Subir Documentos',
        uploading: 'Subiendo...',
        uploadComplete: 'Subida completa',
        uploadFailed: 'Falló la subida',
        dragDropHere: 'Sube Documentos o Arrastra y Suelta',
        selectFiles: 'Seleccionar Archivos',
        progress: 'Progreso',
        success: '{{count}} documento{{plural}} subido{{plural}}.',
        error: 'Falló la subida. Por favor, inténtalo de nuevo.'
      },
      // Settings
      settings: {
        title: 'Configuración',
        account: 'Cuenta',
        profile: 'Perfil',
        security: 'Seguridad',
        notifications: 'Notificaciones',
        language: 'Idioma',
        theme: 'Tema',
        storage: 'Almacenamiento',
        storageUsed: 'Almacenamiento Usado',
        plan: 'Plan',
        upgrade: 'Mejorar',
        changePassword: 'Cambiar Contraseña',
        deleteAccount: 'Eliminar Cuenta',
        languageRegion: 'Idioma y Región',
        interfaceLanguage: 'Idioma de Interfaz',
        answerLanguage: 'Idioma de Respuestas'
      },
      // Notifications
      notifications: {
        title: 'Notificaciones',
        noNotifications: 'Sin notificaciones',
        markAllRead: 'Marcar todo como leído',
        uploadSuccess: 'Documento subido exitosamente',
        uploadError: 'Error al subir documento',
        deleteSuccess: 'Documento eliminado',
        moveSuccess: 'Documento movido'
      },
      // Toast messages
      toast: {
        uploadSuccess: '{{count}} documento(s) subido(s) exitosamente',
        uploadFailed: 'Error al subir',
        deleteSuccess: '{{count}} elemento(s) eliminado(s)',
        rateLimitWarning: '¡Más despacio! Demasiadas solicitudes.',
        rateLimitDetails: 'Por favor, espera unos segundos antes de intentar de nuevo.',
        fileAlreadyExists: 'Archivo duplicado omitido',
        fileAlreadyExistsDetails: '"{{filename}}" ya ha sido subido',
        filesAlreadyExist: '{{count}} archivo(s) duplicado(s) omitido(s)'
      },
      // Errors
      errors: {
        generic: 'Algo salió mal',
        network: 'Error de red. Verifica tu conexión.',
        unauthorized: 'Por favor, inicia sesión para continuar',
        notFound: 'No encontrado',
        fileTooLarge: 'Archivo demasiado grande',
        invalidFileType: 'Tipo de archivo inválido'
      },
      // Auth
      auth: {
        login: 'Iniciar Sesión',
        signup: 'Registrarse',
        logout: 'Cerrar Sesión',
        email: 'Correo Electrónico',
        password: 'Contraseña',
        confirmPassword: 'Confirmar Contraseña',
        forgotPassword: '¿Olvidaste tu contraseña?',
        createAccount: 'Crear Cuenta',
        alreadyHaveAccount: '¿Ya tienes una cuenta?',
        dontHaveAccount: '¿No tienes una cuenta?'
      },
      // File breakdown
      fileBreakdown: {
        title: 'Desglose de Archivos',
        video: 'Video',
        document: 'Documento',
        spreadsheet: 'Hoja de Cálculo',
        image: 'Imagen',
        other: 'Otro'
      },
      // Welcome popup
      welcome: {
        title: 'Únete al Universo de Koda',
        description: 'Regístrate para desbloquear todo el poder de la gestión inteligente de documentos',
        cta: 'Regístrate Ahora'
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // React already escapes values
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage']
    }
  });

export default i18n;
