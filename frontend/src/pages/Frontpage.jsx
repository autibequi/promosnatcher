import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import axios from 'axios'

const getPublicGroups = () => axios.get('/api/public/groups').then(r => r.data)

export default function Frontpage() {
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['publicGroups'],
    queryFn: getPublicGroups,
    staleTime: 30000,
  })

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Hero */}
      <div className="text-center pt-16 pb-12 px-4">
        <span className="text-6xl">🔥</span>
        <h1 className="text-4xl font-bold text-white mt-4">Promo Snatcher</h1>
        <p className="text-gray-400 text-lg mt-3 max-w-md mx-auto">
          Receba as melhores promoções de Mercado Livre e Amazon direto no seu WhatsApp.
        </p>
      </div>

      {/* Groups grid */}
      <div className="max-w-4xl mx-auto px-4 pb-20">
        {isLoading && (
          <p className="text-center text-gray-500">Carregando grupos...</p>
        )}

        {!isLoading && groups.length === 0 && (
          <p className="text-center text-gray-500">Nenhum grupo disponível no momento.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {groups.map((g, i) => (
            <div
              key={i}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-3 hover:border-green-700 transition-colors"
            >
              <h2 className="text-xl font-semibold text-white">{g.name}</h2>
              {g.description && (
                <p className="text-sm text-gray-400">{g.description}</p>
              )}
              <p className="text-xs text-gray-600 italic">Busca: {g.search_prompt}</p>
              <div className="mt-auto pt-3">
                <span className="inline-block text-xs text-gray-500">
                  Entre no grupo para receber ofertas
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-16 pt-8 border-t border-gray-800">
          <p className="text-gray-600 text-sm">
            Powered by Promo Snatcher
          </p>
          <Link
            to="/login"
            className="text-gray-700 hover:text-gray-400 text-xs mt-2 inline-block transition-colors"
          >
            Admin
          </Link>
        </div>
      </div>
    </div>
  )
}
