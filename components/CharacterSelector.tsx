
import React from 'react';
import { CHARACTERS } from '../constants';
import { Character, CharacterId } from '../types';

interface CharacterSelectorProps {
  selectedId: CharacterId;
  onSelect: (character: Character) => void;
}

const CharacterSelector: React.FC<CharacterSelectorProps> = ({ selectedId, onSelect }) => {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
      {CHARACTERS.map((char) => (
        <button
          key={char.id}
          onClick={() => onSelect(char)}
          className={`flex-shrink-0 w-32 group transition-all duration-300 ${
            selectedId === char.id ? 'scale-105' : 'opacity-70 hover:opacity-100'
          }`}
        >
          <div className={`relative rounded-2xl overflow-hidden aspect-square mb-2 border-2 transition-all ${
            selectedId === char.id ? 'border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)]' : 'border-slate-700'
          }`}>
            <img 
              src={char.avatar} 
              alt={char.name} 
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
            <div className={`absolute inset-0 bg-gradient-to-t ${char.color} opacity-20`}></div>
          </div>
          <p className={`text-sm font-bold text-center ${selectedId === char.id ? 'text-amber-400' : 'text-slate-400'}`}>
            {char.name}
          </p>
          <p className="text-[10px] text-center text-slate-500 truncate px-1">
            {char.title}
          </p>
        </button>
      ))}
    </div>
  );
};

export default CharacterSelector;
