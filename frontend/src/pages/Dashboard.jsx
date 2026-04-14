import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getGroups } from '../api'
import GroupCard from '../components/GroupCard'

export default function Dashboard() {
  const { data: groups = [], isLoading, error } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
  })

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Canais</h1>
          <p className="text-gray-400 mt-1 text-sm">{groups.length} cana{groups.length !== 1 ? 'is' : 'l'} cadastrado{groups.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          to="/admin/groups/new"
          className="bg-green-600 hover:bg-green-500 text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm"
        >
          + Novo Canal
        </Link>
      </div>

      {isLoading && (
        <div className="text-center text-gray-400 py-16">Carregando...</div>
      )}

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl p-4">
          Erro ao carregar grupos. Backend rodando?
        </div>
      )}

      {!isLoading && groups.length === 0 && (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">🔍</p>
          <p className="text-gray-400 text-lg">Nenhum canal ainda.</p>
          <p className="text-gray-500 text-sm mt-2">Crie um canal para começar a varrer promoções.</p>
          <Link
            to="/admin/groups/new"
            className="mt-6 inline-block bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-xl transition-colors"
          >
            Criar primeiro canal
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map(g => <GroupCard key={g.id} group={g} />)}
      </div>
    </div>
  )
}
