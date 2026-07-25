"use client"

import { useEffect, useState } from "react"
import { PlusCircle, Trash2, Info, ChevronDown, ChevronUp, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"

interface Player {
  id: number
  name: string
  scores: number[]
  // Ajustes que afectan el total sin pertenecer a ninguna ronda (múltiplos de -50)
  bonus: number
  total: number
}

interface Round {
  id: number
  name: string
  description: string
}

// Definición de las rondas del juego
const rounds: Round[] = [
  { id: 1, name: "Ronda 1", description: "Dos tríos" },
  { id: 2, name: "Ronda 2", description: "Un trío y una escalera" },
  { id: 3, name: "Ronda 3", description: "Dos escaleras" },
  { id: 4, name: "Ronda 4", description: "Tres tríos" },
  { id: 5, name: "Ronda 5", description: "Dos tríos y una escalera" },
  { id: 6, name: "Ronda 6", description: "Un trío y dos escaleras" },
  { id: 7, name: "Ronda 7", description: "Tres escaleras" },
]

const BONUS_STEP = 50
const STORAGE_KEY = "carioca-chilena:partida"

const computeTotal = (scores: number[], bonus: number) => scores.reduce((sum, score) => sum + score, 0) + bonus

const toFiniteNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

// Normaliza lo que venga de localStorage: la partida guardada puede ser de una
// versión anterior (sin `bonus`, con otra cantidad de rondas) o estar corrupta.
const sanitizePlayers = (value: unknown): Player[] => {
  if (!Array.isArray(value)) return []

  return value.map((entry, index) => {
    const raw = (entry ?? {}) as Partial<Player>
    const rawScores = Array.isArray(raw.scores) ? raw.scores : []
    const scores = Array.from({ length: rounds.length }, (_, roundIndex) => toFiniteNumber(rawScores[roundIndex]))
    const bonus = Math.min(0, toFiniteNumber(raw.bonus))

    return {
      id: toFiniteNumber(raw.id, index + 1),
      name: typeof raw.name === "string" && raw.name.trim() !== "" ? raw.name : `Jugador ${index + 1}`,
      scores,
      bonus,
      // El total se recalcula siempre: nunca se confía en el valor guardado
      total: computeTotal(scores, bonus),
    }
  })
}

export default function CariocaScoreTracker() {
  // Cambiar la inicialización de jugadores para comenzar con un array vacío
  const [players, setPlayers] = useState<Player[]>([])
  const [newPlayerName, setNewPlayerName] = useState("")
  const [currentRound, setCurrentRound] = useState(0)
  // Evita que el primer guardado (con el estado vacío inicial) pise la partida
  // guardada antes de haber terminado de restaurarla
  const [restored, setRestored] = useState(false)

  // Restaurar la partida al montar, para no perderla ante un cierre accidental
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { players?: unknown; currentRound?: unknown }
        const savedPlayers = sanitizePlayers(saved.players)
        const savedRound = toFiniteNumber(saved.currentRound)

        setPlayers(savedPlayers)
        setCurrentRound(Math.min(Math.max(Math.trunc(savedRound), 0), rounds.length - 1))
      }
    } catch {
      // Dato corrupto o localStorage no disponible: se arranca una partida nueva
    }
    setRestored(true)
  }, [])

  // Persistir cada cambio de la partida
  useEffect(() => {
    if (!restored) return

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ players, currentRound }))
    } catch {
      // Sin espacio o en modo privado: el juego sigue funcionando en memoria
    }
  }, [players, currentRound, restored])

  // Encontrar el jugador con la puntuación más baja (ganador)
  const minScore = Math.min(...players.map((player) => player.total))
  const leadingPlayers = players.filter((player) => player.total === minScore)

  const addPlayer = () => {
    if (newPlayerName.trim() === "") return

    const newId = players.length > 0 ? Math.max(...players.map((p) => p.id)) + 1 : 1
    setPlayers([
      ...players,
      {
        id: newId,
        name: newPlayerName,
        scores: Array(rounds.length).fill(0),
        bonus: 0,
        total: 0,
      },
    ])
    setNewPlayerName("")
  }

  const removePlayer = (id: number) => {
    setPlayers(players.filter((player) => player.id !== id))
  }

  const updateScore = (playerId: number, roundIndex: number, value: number) => {
    const updatedPlayers = players.map((player) => {
      if (player.id === playerId) {
        const newScores = [...player.scores]
        // Asegurarse de que el puntaje no sea negativo
        newScores[roundIndex] = value
        // Calcular el nuevo total
        return { ...player, scores: newScores, total: computeTotal(newScores, player.bonus) }
      }
      return player
    })
    setPlayers(updatedPlayers)
  }

  // Resta 50 puntos al total sin imputarlos a ninguna ronda
  const addBonus = (playerId: number) => {
    setPlayers(
      players.map((player) => {
        if (player.id !== playerId) return player

        const bonus = player.bonus - BONUS_STEP
        return { ...player, bonus, total: computeTotal(player.scores, bonus) }
      }),
    )
  }

  // Deshace un -50 aplicado por error, sin pasar el bonus a positivo
  const removeBonus = (playerId: number) => {
    setPlayers(
      players.map((player) => {
        if (player.id !== playerId) return player

        const bonus = Math.min(0, player.bonus + BONUS_STEP)
        return { ...player, bonus, total: computeTotal(player.scores, bonus) }
      }),
    )
  }

  // Modificar la función resetScores para que también elimine todos los jugadores
  const resetScores = () => {
    setPlayers([])
    setCurrentRound(0)
  }

  const nextRound = () => {
    if (currentRound < rounds.length - 1) {
      setCurrentRound(currentRound + 1)
    }
  }

  const previousRound = () => {
    if (currentRound > 0) {
      setCurrentRound(currentRound - 1)
    }
  }

  return (
    <div className="container max-w-md mx-auto py-8 px-4">
      <Card className="mb-8">
        <CardHeader className="pb-4">
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl">Carioca Chilena</CardTitle>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Info className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reglas de la Carioca Chilena</DialogTitle>
                  <DialogDescription>
                    <div className="mt-4 space-y-2">
                      <p>La Carioca es un juego de cartas similar al Rummy, jugado con baraja francesa.</p>
                      <p>El objetivo es formar combinaciones de cartas:</p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>
                          <strong>Tríos:</strong> Tres o más cartas del mismo número
                        </li>
                        <li>
                          <strong>Escaleras:</strong> Tres o más cartas consecutivas del mismo palo
                        </li>
                      </ul>
                      <p className="mt-2">Cada ronda tiene requisitos específicos para "bajar" las cartas.</p>
                      <p>
                        El botón <strong>-50</strong> resta 50 puntos al total de un jugador sin cargarlos a ninguna
                        ronda, para premios que no dependen de la mano jugada.
                      </p>
                      <p>
                        Al final, gana quien tenga <strong>menos</strong> puntos acumulados.
                      </p>
                    </div>
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </div>
          <CardDescription>
            {currentRound < rounds.length ? (
              <div className="flex justify-between items-center mt-2">
                <Button variant="outline" size="sm" onClick={previousRound} disabled={currentRound === 0}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <span>
                  <strong>{rounds[currentRound].name}:</strong> {rounds[currentRound].description}
                </span>
                <Button variant="outline" size="sm" onClick={nextRound} disabled={currentRound === rounds.length - 1}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <span>Juego completado</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Puntuación de la ronda actual */}
          <div className="space-y-4 mb-6">
            <h3 className="font-medium">Puntos de la ronda actual:</h3>
            {players.map((player) => (
              <div key={`round-${player.id}`} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="min-w-0">
                  <span className="font-medium">{player.name}</span>
                  {player.bonus !== 0 && (
                    <button
                      type="button"
                      onClick={() => removeBonus(player.id)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      aria-label={`Deshacer un -${BONUS_STEP} de ${player.name}`}
                    >
                      <Undo2 className="h-3 w-3" />
                      Bonus {player.bonus}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="w-16 text-center"
                    value={player.scores[currentRound]}
                    onChange={(e) => updateScore(player.id, currentRound, Number.parseInt(e.target.value) || 0)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addBonus(player.id)}
                    title={`Restar ${BONUS_STEP} puntos a ${player.name} sin contar la ronda`}
                    aria-label={`Restar ${BONUS_STEP} puntos a ${player.name} sin contar la ronda`}
                  >
                    -{BONUS_STEP}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Tabla de puntuaciones */}
          <Accordion type="single" collapsible className="mb-6">
            <AccordionItem value="scores">
              <AccordionTrigger>Ver tabla de puntuaciones</AccordionTrigger>
              <AccordionContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Jugador</TableHead>
                        {rounds.map((round) => (
                          <TableHead key={round.id} className="text-center">
                            R{round.id}
                          </TableHead>
                        ))}
                        <TableHead className="text-center">Bonus</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {players.map((player) => (
                        <TableRow key={player.id}>
                          <TableCell className="font-medium">
                            {player.name}
                            {leadingPlayers.includes(player) && (
                              <Badge variant="outline" className="ml-2 bg-yellow-100 text-yellow-800">
                                🏆
                              </Badge>
                            )}
                          </TableCell>
                          {player.scores.map((score, index) => (
                            <TableCell key={index} className="text-center">
                              {score}
                            </TableCell>
                          ))}
                          <TableCell className="text-center">{player.bonus}</TableCell>
                          <TableCell className="text-center font-bold">{player.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Gestión de jugadores */}
          <div className="mt-6 flex gap-2">
            <Input
              placeholder="Nombre del jugador"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlayer()}
            />
            <Button onClick={addPlayer}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Añadir
            </Button>
          </div>

          {/* Botones de acción */}
          <div className="mt-6 flex justify-center">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">Reiniciar juego</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>¿Estás seguro?</DialogTitle>
                  <DialogDescription>
                    Esta acción reiniciará el juego y eliminará todos los jugadores y puntuaciones.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-2 mt-4">
                  <DialogClose asChild>
                    <Button variant="outline">Cancelar</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="destructive" onClick={resetScores}>
                      Confirmar
                    </Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Lista de jugadores con opción de eliminar */}
          <div className="mt-6">
            <h3 className="font-medium mb-2">Jugadores:</h3>
            <div className="space-y-2">
              {players.map((player) => (
                <div key={`player-${player.id}`} className="flex justify-between items-center p-2 border rounded-lg">
                  <span>{player.name}</span>
                  <Button variant="ghost" size="icon" className="text-red-500" onClick={() => removePlayer(player.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
