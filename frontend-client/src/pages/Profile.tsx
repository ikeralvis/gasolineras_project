import { useAuth } from '../contexts/AuthContext';

export default function Profile() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="w-full max-w-md mx-auto glass p-8">
      <h2 className="text-2xl font-bold mb-6 text-center text-gray-900">Mi perfil</h2>
      <div className="text-gray-700 space-y-4 text-base">
        <div className="flex justify-between items-center">
          <span className="font-medium">Nombre:</span>
          <span>{user.nombre}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="font-medium">Email:</span>
          <span>{user.email}</span>
        </div>
      </div>
    </div>
  );
}
